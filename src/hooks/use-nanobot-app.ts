import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import i18n from "@/i18n";
import { debugLog } from "@/lib/debug-log";
import {
  deleteSession,
  fetchInstalledCliApps,
  fetchMcpPresets,
  fetchSkills,
  fetchSessionAutomations,
  fetchSidebarState,
  fetchThread,
  fetchWorkspaces,
  listSlashCommands,
  listSessions,
  updateSidebarState,
} from "@/lib/api";
import {
  BootstrapAuthRequiredError,
  deriveWsUrl,
  fetchBootstrap,
} from "@/lib/bootstrap";
import { DEFAULT_SERVER_URL } from "@/lib/config";
import { loadLocalDevBootstrapSecret } from "@/lib/local-dev-bootstrap";
import {
  clearBootstrapSecret,
  loadBootstrapSecret,
  saveBootstrapSecret,
} from "@/lib/credentials";
import { NanobotSocket } from "@/lib/nanobot-socket";
import { useDeferredTitleRefresh } from "@/hooks/use-deferred-title-refresh";
import { resolveRuntimeClientPolicy } from "@/lib/runtime-capabilities";
import { sessionTitle } from "@/lib/format";
import { projectWebuiThreadMessages } from "@/lib/thread-display-compat";
import { hasPendingAgentActivity } from "@/lib/activity-timeline";
import { normalizeWorkspaceScope, projectNameFromPath } from "@/lib/workspace";
import {
  formatQuotedUserMessage,
  normalizeQuotedContext,
} from "@/lib/user-message-quote";
import {
  STREAM_END_IDLE_DELAY_MS,
  appendSideChannelMessage,
  createStreamFoldState,
  eventExtendsModelActivity,
  finalizeStreamedTurn,
  foldStreamEvent,
  prepareStreamFoldForUserTurn,
  resetStreamFoldState,
  streamEventTurn,
} from "@/lib/stream-fold";
import type {
  BootstrapResponse,
  ChatSummary,
  CliAppInfo,
  CliAppsPayload,
  ConnectionStatus,
  GoalStateWsPayload,
  InboundEvent,
  McpPresetInfo,
  McpPresetsPayload,
  SessionAutomationJob,
  SessionDeleteResult,
  SendAttachment,
  SendMessageOptions,
  SidebarStatePayload,
  SlashCommand,
  SkillSummary,
  StreamError,
  UIMessage,
  WorkspacesPayload,
  WorkspaceScopePayload,
} from "@/types/nanobot";

const DEFAULT_SIDEBAR_STATE: SidebarStatePayload = {
  schema_version: 1,
  pinned_keys: [],
  archived_keys: [],
  title_overrides: {},
  project_name_overrides: {},
  tags_by_key: {},
  collapsed_groups: {},
  view: {
    density: "comfortable",
    show_previews: false,
    show_timestamps: false,
    show_archived: false,
    sort: "updated_desc",
  },
};

type AppPhase = "booting" | "authentication" | "ready" | "unreachable";

function normalizedMessages(messages: UIMessage[]): UIMessage[] {
  return projectWebuiThreadMessages(messages);
}

function normalizedForkBoundary(
  messages: UIMessage[],
  rawBoundary?: number,
): number | null {
  if (typeof rawBoundary !== "number") return null;
  return Math.max(0, Math.min(rawBoundary, messages.length));
}

function streamErrorFromInbound(
  event: Extract<InboundEvent, { event: "error" }>,
): StreamError | null {
  if (event.detail === "message_too_big") {
    return {
      kind: "message_too_big",
      chatId: event.chat_id,
      turnId: event.turn_id,
    };
  }
  if (event.detail === "workspace_scope_rejected") {
    return {
      kind: "workspace_scope_rejected",
      reason: event.reason,
      chatId: event.chat_id,
      turnId: event.turn_id,
    };
  }
  if (event.chat_id && event.turn_id) {
    return {
      kind: "turn_rejected",
      detail: event.detail,
      reason: event.reason,
      chatId: event.chat_id,
      turnId: event.turn_id,
    };
  }
  return null;
}

function chatIdFromKey(key: string | null): string | null {
  if (!key) return null;
  const separator = key.indexOf(":");
  return separator < 0 ? key : key.slice(separator + 1);
}

function sameSemanticMessage(left: UIMessage, right: UIMessage): boolean {
  if (left.id && right.id && left.id === right.id) return true;
  return (
    left.role === right.role &&
    (left.kind ?? "") === (right.kind ?? "") &&
    left.content === right.content &&
    (!left.turnId || !right.turnId || left.turnId === right.turnId)
  );
}

function mergeLatestMessages(
  current: UIMessage[],
  latest: UIMessage[],
): UIMessage[] {
  if (current.length === 0) return latest;
  const maxOverlap = Math.min(current.length, latest.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const currentStart = current.length - overlap;
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (!sameSemanticMessage(current[currentStart + index], latest[index])) {
        matches = false;
        break;
      }
    }
    if (matches) return [...current.slice(0, currentStart), ...latest];
  }
  const hasLocalTurn = current.some(
    (message) =>
      message.isStreaming ||
      (message.role === "user" && message.id.startsWith("user-")),
  );
  if (!hasLocalTurn) return latest;

  // A selected chat remains writable while its initial history request is in
  // flight, matching WebUI. Preserve that post-request live tail while also
  // adopting the inherited/canonical prefix returned by the server.
  const merged = [...latest];
  for (const liveMessage of current) {
    if (merged.some((message) => sameSemanticMessage(message, liveMessage)))
      continue;

    if (liveMessage.turnId && liveMessage.role === "user") {
      const canonicalUser = merged.find(
        (message) =>
          message.role === "user" && message.turnId === liveMessage.turnId,
      );
      if (canonicalUser) continue;
    }

    if (
      liveMessage.turnId &&
      liveMessage.role === "assistant" &&
      liveMessage.kind !== "trace"
    ) {
      const canonicalIndex = merged.findIndex(
        (message) =>
          message.role === "assistant" &&
          message.kind !== "trace" &&
          message.turnId === liveMessage.turnId &&
          (message.kind ?? "") === (liveMessage.kind ?? "") &&
          (message.content.startsWith(liveMessage.content) ||
            liveMessage.content.startsWith(message.content)),
      );
      if (canonicalIndex >= 0) {
        const canonicalMessage = merged[canonicalIndex];
        if (
          liveMessage.content.length > canonicalMessage.content.length ||
          liveMessage.isStreaming
        ) {
          merged[canonicalIndex] = liveMessage;
        }
        continue;
      }
    }

    merged.push(liveMessage);
  }
  return merged;
}

type MessageShape = Pick<
  UIMessage,
  "role" | "kind" | "content" | "isStreaming" | "turnId"
>;

function sameMessageShape(left: MessageShape, right: MessageShape): boolean {
  return (
    left.role === right.role &&
    (left.kind ?? "") === (right.kind ?? "") &&
    left.content === right.content &&
    (!left.turnId || !right.turnId || left.turnId === right.turnId)
  );
}

function snapshotPreservesMessage(
  current: MessageShape,
  candidate: MessageShape,
  allowCompletedTurnReplacement: boolean,
): boolean {
  if (sameMessageShape(current, candidate)) return true;
  if (
    allowCompletedTurnReplacement &&
    current.role === "assistant" &&
    candidate.role === current.role &&
    (candidate.kind ?? "") === (current.kind ?? "") &&
    Boolean(current.turnId) &&
    candidate.turnId === current.turnId
  )
    return true;
  return (
    current.role === "assistant" &&
    current.isStreaming === true &&
    candidate.role === current.role &&
    (candidate.kind ?? "") === (current.kind ?? "") &&
    (!current.turnId ||
      !candidate.turnId ||
      candidate.turnId === current.turnId) &&
    candidate.content.startsWith(current.content)
  );
}

function durableMessageShape(message: UIMessage): MessageShape | null {
  if (message.kind === "trace") return null;
  if (message.role !== "user" && message.role !== "assistant") return null;
  if (
    message.role === "assistant" &&
    !message.content.trim() &&
    !message.media?.length
  ) {
    return null;
  }
  return {
    role: message.role,
    kind: message.kind,
    content: message.content,
    isStreaming: message.isStreaming,
    turnId: message.turnId,
  };
}

function durableMessageShapes(messages: UIMessage[]): MessageShape[] {
  return messages
    .map(durableMessageShape)
    .filter((message): message is MessageShape => message !== null);
}

function preservesDurableMessages(
  current: UIMessage[],
  snapshot: UIMessage[],
  allowCompletedTurnReplacement = false,
): boolean {
  const expected = durableMessageShapes(current);
  if (expected.length === 0) return true;
  const candidates = durableMessageShapes(snapshot);
  let cursor = 0;
  let previousCandidate: MessageShape | null = null;
  for (const message of expected) {
    if (
      allowCompletedTurnReplacement &&
      previousCandidate?.role === "assistant" &&
      message.role === "assistant" &&
      Boolean(message.turnId) &&
      message.turnId === previousCandidate.turnId
    )
      continue;
    let found = false;
    while (cursor < candidates.length) {
      const candidate = candidates[cursor];
      cursor += 1;
      if (
        !snapshotPreservesMessage(
          message,
          candidate,
          allowCompletedTurnReplacement,
        )
      )
        continue;
      found = true;
      previousCandidate = candidate;
      break;
    }
    if (!found) return false;
  }
  return true;
}

function isStaleThreadSnapshot(
  current: UIMessage[],
  snapshot: UIMessage[],
): boolean {
  if (current.length === 0) return false;
  if (snapshot.length === 0) return true;
  return !preservesDurableMessages(current, snapshot, true);
}

function completedTurnIds(
  messages: UIMessage[],
  persistedTurnIds?: string[],
): string[] {
  return Array.from(
    new Set([
      ...(persistedTurnIds ?? []).filter((turnId) => turnId.length > 0),
      ...messages
        .filter(
          (message) => message.role === "assistant" && Boolean(message.turnId),
        )
        .map((message) => message.turnId as string),
    ]),
  );
}

function canonicalRunSnapshot(
  messages: UIMessage[],
  hasPendingToolCalls: boolean,
  activeTurnId: string | null,
) {
  return {
    observedTurnIds: Array.from(
      new Set(
        messages
          .filter(
            (message) => message.role === "user" && Boolean(message.turnId),
          )
          .map((message) => message.turnId as string),
      ),
    ),
    hasPendingToolCalls,
    activeTurnId,
  };
}

function prependOlderMessages(
  current: UIMessage[],
  older: UIMessage[],
): UIMessage[] {
  if (older.length === 0) return current;
  const firstCurrent = current[0];
  const boundary = firstCurrent
    ? older.findIndex((message) => sameSemanticMessage(message, firstCurrent))
    : -1;
  const prefix = boundary >= 0 ? older.slice(0, boundary) : older;
  const seen = new Set(current.map((message) => message.id));
  return [...prefix.filter((message) => !seen.has(message.id)), ...current];
}

function optimisticUserMessage(
  content: string,
  turnId: string,
  attachments: SendAttachment[],
  options: SendMessageOptions,
): UIMessage {
  return {
    id: `user-${turnId}`,
    role: "user",
    content,
    createdAt: Date.now(),
    turnId,
    turnPhase: "user",
    ...(attachments.length
      ? { media: attachments.map((item) => item.preview) }
      : {}),
    ...(options.cliApps?.length ? { cliApps: options.cliApps } : {}),
    ...(options.mcpPresets?.length ? { mcpPresets: options.mcpPresets } : {}),
  };
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateOutboundMessage(
  bootstrap: BootstrapResponse,
  chatId: string,
  content: string,
  attachments: SendAttachment[],
  options: SendMessageOptions,
): void {
  const limits = bootstrap.limits;
  if (!limits) return;
  if (utf8Bytes(content) > limits.message.max_text_bytes) {
    throw new Error(
      i18n.t("thread.composer.textTooLarge", {
        max: limits.message.max_text_bytes,
      }),
    );
  }
  if (attachments.length > limits.attachments.max_count) {
    throw new Error(
      i18n.t("thread.composer.imageRejected.too_many_attachments", {
        max: limits.attachments.max_count,
      }),
    );
  }
  const projectedFrame = JSON.stringify({
    type: "message",
    chat_id: chatId,
    content,
    media: attachments.map((item) => item.media),
    ...(options.cliApps?.length ? { cli_apps: options.cliApps } : {}),
    ...(options.mcpPresets?.length ? { mcp_presets: options.mcpPresets } : {}),
    ...(options.quotedContext?.trim()
      ? { quoted_context: options.quotedContext.trim() }
      : {}),
    ...(options.workspaceScope
      ? { workspace_scope: options.workspaceScope }
      : {}),
    turn_id: "00000000-0000-4000-8000-000000000000",
    webui: true,
  });
  if (utf8Bytes(projectedFrame) > limits.transport.max_frame_bytes) {
    throw new Error(
      i18n.t("thread.composer.imageRejected.transport_too_large"),
    );
  }
}

export function useNanobotApp() {
  debugLog("HOOK", "useNanobotApp enter");
  const [phase, setPhase] = useState<AppPhase>("booting");
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [authenticationFailed, setAuthenticationFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<StreamError | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [sessions, setSessions] = useState<ChatSummary[]>([]);
  const [sidebarState, setSidebarState] = useState<SidebarStatePayload>(
    DEFAULT_SIDEBAR_STATE,
  );
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [beforeCursor, setBeforeCursor] = useState<string | null>(null);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [userMessageOffset, setUserMessageOffset] = useState(0);
  const [forkBoundaryMessageCount, setForkBoundaryMessageCount] = useState<
    number | null
  >(null);
  const [turnActive, setTurnActive] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [goalState, setGoalState] = useState<GoalStateWsPayload | undefined>();
  const [runtimeModelName, setRuntimeModelName] = useState<string | null>(null);
  const [turnModelName, setTurnModelName] = useState<string | null>(null);
  const [modelSettingsRevision, setModelSettingsRevision] = useState(0);
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [cliApps, setCliApps] = useState<CliAppInfo[]>([]);
  const [mcpPresets, setMcpPresets] = useState<McpPresetInfo[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspacesPayload | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [draftWorkspaceScope, setDraftWorkspaceScope] =
    useState<WorkspaceScopePayload | null>(null);
  const [workspaceOverrides, setWorkspaceOverrides] = useState<
    Record<string, WorkspaceScopePayload>
  >({});
  const secretRef = useRef("");
  const bootstrapRef = useRef<BootstrapResponse | null>(null);
  const socketRef = useRef<NanobotSocket | null>(null);
  const optimisticSessionKeysRef = useRef<Set<string>>(new Set());
  const hasOpenedSocketRef = useRef(false);
  const needsCanonicalReconnectRef = useRef(false);
  const canonicalRequestVersionRef = useRef(0);
  const uiMutationVersionRef = useRef(0);
  const activeKeyRef = useRef<string | null>(null);
  const sidebarStateRef = useRef(DEFAULT_SIDEBAR_STATE);
  const sidebarMutationVersionRef = useRef(0);
  const historyRequestVersionRef = useRef(0);
  const streamFoldRef = useRef(createStreamFoldState());
  const pendingStreamEventsRef = useRef<InboundEvent[]>([]);
  const pendingStreamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const streamEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sideChannelTurnIdsRef = useRef<Set<string>>(new Set());
  const modelPresetOverrideRef = useRef<string | null>(null);
  const messagesRef = useRef<UIMessage[]>([]);
  const connectionStatusRef = useRef<ConnectionStatus>("idle");
  const turnActiveRef = useRef(false);
  const lastStreamErrorRef = useRef<StreamError | null>(null);
  const canonicalRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const canonicalRetryAttemptRef = useRef(0);
  const scheduleCanonicalReconnectRef = useRef<
    (socket: NanobotSocket, delayMs?: number) => void
  >(() => undefined);

  const applyStreamError = useCallback((nextError: StreamError) => {
    const selectedChatId = chatIdFromKey(activeKeyRef.current);
    if (
      !selectedChatId ||
      (nextError.chatId && nextError.chatId !== selectedChatId)
    )
      return;
    lastStreamErrorRef.current = nextError;
    setStreamError(nextError);
  }, []);

  const dismissStreamError = useCallback(() => {
    lastStreamErrorRef.current = null;
    setStreamError(null);
  }, []);

  const cancelPendingStreamFlush = useCallback(() => {
    if (pendingStreamTimerRef.current !== null) {
      clearTimeout(pendingStreamTimerRef.current);
      pendingStreamTimerRef.current = null;
    }
  }, []);

  const cancelStreamEndTimer = useCallback(() => {
    if (streamEndTimerRef.current !== null) {
      clearTimeout(streamEndTimerRef.current);
      streamEndTimerRef.current = null;
    }
  }, []);

  const cancelCanonicalRetry = useCallback(() => {
    if (canonicalRetryTimerRef.current !== null) {
      clearTimeout(canonicalRetryTimerRef.current);
      canonicalRetryTimerRef.current = null;
    }
  }, []);

  const flushPendingStreamEvents = useCallback(() => {
    cancelPendingStreamFlush();
    const pending = pendingStreamEventsRef.current;
    if (!pending.length) return;
    pendingStreamEventsRef.current = [];
    uiMutationVersionRef.current += 1;
    setMessages((current) =>
      pending.reduce(
        (next, event) => foldStreamEvent(next, event, streamFoldRef.current),
        current,
      ),
    );
  }, [cancelPendingStreamFlush]);

  const schedulePendingStreamFlush = useCallback(() => {
    if (pendingStreamTimerRef.current !== null) return;
    pendingStreamTimerRef.current = setTimeout(() => {
      pendingStreamTimerRef.current = null;
      const pending = pendingStreamEventsRef.current;
      if (!pending.length) return;
      pendingStreamEventsRef.current = [];
      uiMutationVersionRef.current += 1;
      setMessages((current) =>
        pending.reduce(
          (next, event) => foldStreamEvent(next, event, streamFoldRef.current),
          current,
        ),
      );
    }, 16);
  }, []);

  const scheduleStreamEndTimer = useCallback(
    (event: InboundEvent) => {
      cancelStreamEndTimer();
      const turn = streamEventTurn(event, "answer");
      streamEndTimerRef.current = setTimeout(() => {
        streamEndTimerRef.current = null;
        uiMutationVersionRef.current += 1;
        setTurnActive(false);
        setRunStartedAt(null);
        setMessages((current) => finalizeStreamedTurn(current, turn));
      }, STREAM_END_IDLE_DELAY_MS);
    },
    [cancelStreamEndTimer],
  );

  const resetStreamingRuntime = useCallback(() => {
    cancelPendingStreamFlush();
    cancelStreamEndTimer();
    pendingStreamEventsRef.current = [];
    sideChannelTurnIdsRef.current.clear();
    resetStreamFoldState(streamFoldRef.current);
  }, [cancelPendingStreamFlush, cancelStreamEndTimer]);

  const applyCliAppsPayload = useCallback((payload: CliAppsPayload) => {
    setCliApps(payload.apps.filter((app) => app.installed));
  }, []);

  const applyMcpPresetsPayload = useCallback((payload: McpPresetsPayload) => {
    setMcpPresets(
      payload.presets.filter((preset) => preset.installed && preset.configured),
    );
  }, []);

  const refreshCanonicalHistory = useCallback(
    async (socket: NanobotSocket): Promise<boolean> => {
      const currentBootstrap = bootstrapRef.current;
      const key = activeKeyRef.current;
      const chatId = chatIdFromKey(key);
      if (!currentBootstrap || !key || !chatId || socketRef.current !== socket)
        return false;

      const requestVersion = canonicalRequestVersionRef.current + 1;
      canonicalRequestVersionRef.current = requestVersion;
      const historyVersion = historyRequestVersionRef.current + 1;
      historyRequestVersionRef.current = historyVersion;
      const expectedRunGeneration = socket.getRunGeneration(chatId);
      const expectedUiMutationVersion = uiMutationVersionRef.current;

      try {
        const thread = await fetchThread(
          DEFAULT_SERVER_URL,
          currentBootstrap.api_token,
          key,
          { limit: 160, direction: "latest" },
        );
        if (
          !thread ||
          canonicalRequestVersionRef.current !== requestVersion ||
          historyRequestVersionRef.current !== historyVersion ||
          uiMutationVersionRef.current !== expectedUiMutationVersion ||
          activeKeyRef.current !== key ||
          socketRef.current !== socket
        )
          return false;

        const latest = normalizedMessages(thread.messages);
        const activeTurnId = thread.active_turn_id ?? null;
        const hasPendingToolCalls =
          typeof thread.has_pending_tool_calls === "boolean"
            ? thread.has_pending_tool_calls
            : hasPendingAgentActivity(latest);
        if (activeTurnId || hasPendingToolCalls) {
          setTurnActive(true);
          return true;
        }
        if (isStaleThreadSnapshot(messagesRef.current, latest)) return false;
        const canonicalCompletedTurnIds = completedTurnIds(
          latest,
          thread.completed_turn_ids,
        );
        const snapshot = canonicalRunSnapshot(
          latest,
          hasPendingToolCalls,
          activeTurnId,
        );
        if (
          !socket.canReconcileCanonicalCompletion(
            chatId,
            expectedRunGeneration,
            canonicalCompletedTurnIds,
            snapshot,
          )
        )
          return false;
        if (
          !socket.reconcileCanonicalCompletion(
            chatId,
            expectedRunGeneration,
            canonicalCompletedTurnIds,
            snapshot,
          )
        )
          return false;
        if (
          canonicalRequestVersionRef.current !== requestVersion ||
          historyRequestVersionRef.current !== historyVersion ||
          uiMutationVersionRef.current !== expectedUiMutationVersion ||
          activeKeyRef.current !== key ||
          socketRef.current !== socket
        )
          return false;

        resetStreamingRuntime();
        uiMutationVersionRef.current += 1;
        messagesRef.current = latest;
        setMessages(latest);
        setBeforeCursor(thread.page?.before_cursor ?? null);
        setHasMoreBefore(Boolean(thread.page?.has_more_before));
        setUserMessageOffset(
          Math.max(0, thread.page?.user_message_offset ?? 0),
        );
        setForkBoundaryMessageCount(
          normalizedForkBoundary(
            thread.messages,
            thread.fork_boundary_message_count,
          ),
        );
        setTurnActive(false);
        setRunStartedAt(null);
        return true;
      } catch (caught) {
        if (
          canonicalRequestVersionRef.current === requestVersion &&
          activeKeyRef.current === key &&
          socketRef.current === socket
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : i18n.t("chat.resyncFailed", {
                  defaultValue: "Could not resync the topic",
                }),
          );
        }
        return false;
      }
    },
    [resetStreamingRuntime],
  );

  const scheduleCanonicalReconnect = useCallback(
    (socket: NanobotSocket, delayMs = 0) => {
      cancelCanonicalRetry();
      canonicalRetryTimerRef.current = setTimeout(() => {
        canonicalRetryTimerRef.current = null;
        if (
          socketRef.current !== socket ||
          connectionStatusRef.current !== "open" ||
          !needsCanonicalReconnectRef.current
        )
          return;
        void refreshCanonicalHistory(socket).then((reconciled) => {
          if (
            socketRef.current !== socket ||
            connectionStatusRef.current !== "open" ||
            !needsCanonicalReconnectRef.current
          )
            return;
          if (reconciled) {
            needsCanonicalReconnectRef.current = false;
            canonicalRetryAttemptRef.current = 0;
            return;
          }
          const attempt = canonicalRetryAttemptRef.current + 1;
          canonicalRetryAttemptRef.current = attempt;
          scheduleCanonicalReconnectRef.current(
            socket,
            Math.min(500 * 2 ** (attempt - 1), 5_000),
          );
        });
      }, delayMs);
    },
    [cancelCanonicalRetry, refreshCanonicalHistory],
  );

  useEffect(() => {
    scheduleCanonicalReconnectRef.current = scheduleCanonicalReconnect;
  }, [scheduleCanonicalReconnect]);

  useEffect(() => {
    activeKeyRef.current = activeKey;
  }, [activeKey]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  useEffect(() => {
    sidebarStateRef.current = sidebarState;
  }, [sidebarState]);

  const requestBootstrap = useCallback(
    async (secret: string, persist: boolean) => {
      debugLog("BOOT", "fetchBootstrap start url=" + DEFAULT_SERVER_URL);
      let payload;
      try {
        payload = await fetchBootstrap(DEFAULT_SERVER_URL, secret);
      } catch (err) {
        debugLog("BOOT", "fetchBootstrap error: " + (err instanceof Error ? err.message : String(err)));
        throw err;
      }
      debugLog("BOOT", "fetchBootstrap ok token=" + (payload.token ? "yes" : "no"));
      secretRef.current = secret;
      bootstrapRef.current = payload;
      socketRef.current?.updateUrl(
        deriveWsUrl(
          DEFAULT_SERVER_URL,
          payload.ws_path,
          payload.token,
          payload.ws_url,
        ),
      );
      socketRef.current?.updateMaxFrameBytes(
        payload.limits?.transport.max_frame_bytes,
      );
      if (persist) await saveBootstrapSecret(secret);
      setBootstrap(payload);
      setRuntimeModelName(payload.model_name?.trim() || null);
      setAuthenticationFailed(false);
      setError(null);
      setPhase("ready");
      return payload;
    },
    [],
  );

  const authenticate = useCallback(
    async (secret: string) => {
      setPhase("booting");
      try {
        await requestBootstrap(secret.trim(), true);
      } catch (caught) {
        if (caught instanceof BootstrapAuthRequiredError) {
          setAuthenticationFailed(true);
          setPhase("authentication");
          return;
        }
        setError(
          caught instanceof Error ? caught.message : i18n.t("app.error.title"),
        );
        setPhase("unreachable");
      }
    },
    [requestBootstrap],
  );

  // Bootstrap from SecureStore. During local development only, seed an empty
  // store from the gitignored dev-secret module so the temporary dev workflow
  // can skip the authentication screen without committing credentials.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const savedSecret = await loadBootstrapSecret();
      const localDevSecret = loadLocalDevBootstrapSecret();
      const bootstrapSecret = savedSecret || localDevSecret;
      if (cancelled) return;
      debugLog("AUTH", "savedSecret=" + (savedSecret ? "yes" : "no"));
      if (!bootstrapSecret) {
        setPhase("authentication");
        return;
      }
      try {
        await requestBootstrap(bootstrapSecret, !savedSecret && Boolean(localDevSecret));
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof BootstrapAuthRequiredError) {
          await clearBootstrapSecret();
          setPhase("authentication");
          return;
        }
        setError(
          caught instanceof Error ? caught.message : i18n.t("app.error.title"),
        );
        setPhase("unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestBootstrap]);

  useEffect(() => {
    if (!bootstrap || phase !== "ready") return;
    const refreshAfterMs = Math.max(
      30_000,
      bootstrap.expires_in * 1000 - 60_000,
    );
    const timer = setTimeout(() => {
      void requestBootstrap(secretRef.current, false).catch(() => {
        // The socket reconnect path also refreshes credentials; keep the current UI available.
      });
    }, refreshAfterMs);
    return () => clearTimeout(timer);
  }, [bootstrap, phase, requestBootstrap]);

  const refreshSessions = useCallback(async () => {
    const currentBootstrap = bootstrapRef.current;
    if (!currentBootstrap) return;
    const sidebarVersion = sidebarMutationVersionRef.current;
    setSessionsLoading(true);
    try {
      const [sessionRows, sidebar] = await Promise.all([
        listSessions(DEFAULT_SERVER_URL, currentBootstrap.api_token),
        fetchSidebarState(DEFAULT_SERVER_URL, currentBootstrap.api_token),
      ]);
      const serverKeys = new Set(sessionRows.map((session) => session.key));
      setSessions((current) => [
        ...sessionRows,
        ...current.filter(
          (session) =>
            optimisticSessionKeysRef.current.has(session.key) &&
            !serverKeys.has(session.key),
        ),
      ]);
      for (const key of Array.from(optimisticSessionKeysRef.current)) {
        if (serverKeys.has(key)) optimisticSessionKeysRef.current.delete(key);
      }
      if (sidebarMutationVersionRef.current === sidebarVersion)
        setSidebarState(sidebar);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : i18n.t("chat.loadSessionsFailed", {
              defaultValue: "Could not load topics",
            }),
      );
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const activeSession = useMemo(
    () => sessions.find((session) => session.key === activeKey) ?? null,
    [activeKey, sessions],
  );
  const refreshSessionsAfterTurn = useDeferredTitleRefresh(
    activeSession,
    refreshSessions,
  );

  const refreshWorkspaces = useCallback(async () => {
    const currentBootstrap = bootstrapRef.current;
    if (!currentBootstrap) return;
    try {
      setWorkspaces(
        await fetchWorkspaces(DEFAULT_SERVER_URL, currentBootstrap.api_token),
      );
    } catch {
      // Workspace controls are optional on older gateways. Keep chat usable.
      setWorkspaces(null);
    }
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    const timer = setTimeout(() => {
      void refreshSessions();
      void refreshWorkspaces();
    }, 0);
    return () => clearTimeout(timer);
  }, [phase, refreshSessions, refreshWorkspaces]);

  useEffect(() => {
    if (!bootstrap || phase !== "ready") return;
    let cancelled = false;
    void listSlashCommands(DEFAULT_SERVER_URL, bootstrap.api_token)
      .then((commands) => {
        if (!cancelled) setSlashCommands(commands);
      })
      .catch(() => {
        // Commands are an enhancement. Keep chat usable when an older server
        // does not expose /api/commands or the request temporarily fails.
        if (!cancelled) setSlashCommands([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap, phase]);

  useEffect(() => {
    if (!bootstrap || phase !== "ready") return;
    let cancelled = false;
    void Promise.allSettled([
      fetchInstalledCliApps(DEFAULT_SERVER_URL, bootstrap.api_token),
      fetchMcpPresets(DEFAULT_SERVER_URL, bootstrap.api_token),
      fetchSkills(DEFAULT_SERVER_URL, bootstrap.api_token),
    ]).then(([cliResult, mcpResult, skillsResult]) => {
      if (cancelled) return;
      if (cliResult.status === "fulfilled") {
        applyCliAppsPayload(cliResult.value);
      }
      if (mcpResult.status === "fulfilled") {
        applyMcpPresetsPayload(mcpResult.value);
      }
      if (skillsResult.status === "fulfilled") {
        setSkills(skillsResult.value.skills);
      }
      // Catalog metadata enriches activity rows but must never block chat or erase
      // the last successful result during a transient refresh failure.
    });
    return () => {
      cancelled = true;
    };
  }, [applyCliAppsPayload, applyMcpPresetsPayload, bootstrap, phase]);

  useEffect(() => {
    if (phase !== "ready") return;
    const currentBootstrap = bootstrapRef.current;
    if (!currentBootstrap) return;
    let active = true;
    const socket = new NanobotSocket(
      deriveWsUrl(
        DEFAULT_SERVER_URL,
        currentBootstrap.ws_path,
        currentBootstrap.token,
        currentBootstrap.ws_url,
      ),
      async () => {
        const refreshed = await requestBootstrap(secretRef.current, false);
        return deriveWsUrl(
          DEFAULT_SERVER_URL,
          refreshed.ws_path,
          refreshed.token,
          refreshed.ws_url,
        );
      },
      currentBootstrap.limits?.transport.max_frame_bytes,
    );
    socketRef.current = socket;
    const unsubscribeStatus = socket.onStatus((status) => {
      connectionStatusRef.current = status;
      setConnectionStatus(status);
      if (status !== "open") {
        if (
          hasOpenedSocketRef.current &&
          (status === "reconnecting" ||
            status === "error" ||
            status === "closed")
        )
          needsCanonicalReconnectRef.current = true;
        if (
          status === "reconnecting" ||
          status === "error" ||
          status === "closed"
        ) {
          cancelCanonicalRetry();
          flushPendingStreamEvents();
          cancelStreamEndTimer();
        }
        return;
      }

      const shouldReconcile =
        hasOpenedSocketRef.current && needsCanonicalReconnectRef.current;
      hasOpenedSocketRef.current = true;
      if (shouldReconcile) {
        scheduleCanonicalReconnect(socket);
      }
    });
    const unsubscribeRunStatus = socket.onRunStatus((chatId, startedAt) => {
      if (!active) return;
      setSessions((current) =>
        current.map((session) =>
          session.chatId === chatId
            ? { ...session, runStartedAt: startedAt }
            : session,
        ),
      );
      if (chatIdFromKey(activeKeyRef.current) !== chatId) return;
      setRunStartedAt(startedAt);
      setTurnActive(startedAt !== null || socket.hasUnsettledRun(chatId));
    });
    const unsubscribeTransportErrors = socket.onTransportError(
      (transportError) => {
        if (!active) return;
        if (transportError.kind === "workspace_scope_rejected") {
          setWorkspaceError(i18n.t("errors.workspaceScopeRejected.body"));
          void refreshWorkspaces();
        }
        applyStreamError(transportError);
      },
    );
    const unsubscribeEvents = socket.onEvent((event) => {
      if (!active) return;
      if (event.event === "runtime_model_updated") {
        setRuntimeModelName(event.model_name.trim() || null);
        setModelSettingsRevision((current) => current + 1);
        return;
      }
      if (event.event === "session_updated") {
        void refreshSessions();
        if (event.workspace_scope) {
          const nextScope = normalizeWorkspaceScope(event.workspace_scope);
          setWorkspaceOverrides((current) => ({
            ...current,
            [event.chat_id]: nextScope,
          }));
          setDraftWorkspaceScope(nextScope);
          setWorkspaceError(null);
          void refreshWorkspaces();
        }
        const selectedChatId = chatIdFromKey(activeKeyRef.current);
        if (event.chat_id === selectedChatId && event.scope !== "metadata") {
          needsCanonicalReconnectRef.current = true;
          scheduleCanonicalReconnect(socket);
        }
        return;
      }
      const selectedChatId = chatIdFromKey(activeKeyRef.current);
      if (
        "chat_id" in event &&
        event.chat_id &&
        event.chat_id !== selectedChatId
      ) {
        socket.deferInboundEvent(event);
        return;
      }
      if (
        !("chat_id" in event) ||
        !event.chat_id ||
        event.chat_id !== selectedChatId
      )
        return;

      if (event.event === "error") {
        if (event.detail === "workspace_scope_rejected") {
          setWorkspaceError(i18n.t("errors.workspaceScopeRejected.body"));
          void refreshWorkspaces();
        }
        const structuredError = streamErrorFromInbound(event);
        if (structuredError) applyStreamError(structuredError);
        else
          setError(
            [event.detail, event.reason].filter(Boolean).join(": ") ||
              i18n.t("app.error.serverError", {
                defaultValue: "The server returned an error",
              }),
          );
      }

      if (event.event === "turn_model_updated") {
        setTurnModelName(event.model_name.trim() || null);
        return;
      }
      if (event.event === "goal_state") {
        setGoalState(event.goal_state);
        return;
      }

      uiMutationVersionRef.current += 1;
      const turnId =
        "turn_id" in event && typeof event.turn_id === "string"
          ? event.turn_id
          : null;
      const sideChannelEvent = Boolean(
        turnId && sideChannelTurnIdsRef.current.has(turnId),
      );

      if (event.event === "error" && turnId) {
        flushPendingStreamEvents();
        sideChannelTurnIdsRef.current.delete(turnId);
        setMessages((current) =>
          current.filter((message) => message.turnId !== turnId),
        );
        if (!sideChannelEvent && !socket.hasUnsettledRun(event.chat_id)) {
          cancelStreamEndTimer();
          resetStreamFoldState(streamFoldRef.current);
          setTurnActive(false);
          setRunStartedAt(null);
        }
        return;
      }

      if (sideChannelEvent) {
        if (event.event === "message") {
          setMessages((current) => {
            const next = appendSideChannelMessage(
              current, event, streamFoldRef.current,
            );
            return next === current
              ? current
              : projectWebuiThreadMessages(next);
          });
          if (turnId) sideChannelTurnIdsRef.current.delete(turnId);
        } else if (event.event === "turn_end") {
          if (turnId) sideChannelTurnIdsRef.current.delete(turnId);
        }
        return;
      }

      if (event.event === "goal_status") {
        const running = event.status === "running";
        setTurnActive(running);
        if (running) {
          if (typeof event.started_at === "number")
            setRunStartedAt(event.started_at);
        } else {
          setRunStartedAt(null);
        }
        return;
      }

      if (
        streamEndTimerRef.current !== null &&
        eventExtendsModelActivity(event)
      ) {
        cancelStreamEndTimer();
      }

      if (event.event === "delta" || event.event === "reasoning_delta") {
        if (streamFoldRef.current.suppressStreamUntilTurnEnd) return;
        if (!event.text) return;
        pendingStreamEventsRef.current.push(event);
        setTurnActive(true);
        schedulePendingStreamFlush();
        return;
      }

      flushPendingStreamEvents();

      if (event.event === "stream_end") {
        setMessages((current) =>
          foldStreamEvent(current, event, streamFoldRef.current),
        );
        if (streamFoldRef.current.suppressStreamUntilTurnEnd) return;
        if (event.resuming) {
          cancelStreamEndTimer();
          setTurnActive(true);
          if (!(event.merge_next === true)) {
            const turn = streamEventTurn(event, "answer");
            setMessages((current) => finalizeStreamedTurn(current, turn));
          }
        } else {
          scheduleStreamEndTimer(event);
        }
        return;
      }

      setMessages((current) =>
        foldStreamEvent(current, event, streamFoldRef.current),
      );
      if (
        event.event === "message_accepted" ||
        event.event === "file_edit" ||
        (event.event === "message" &&
          (event.kind === "tool_hint" ||
            event.kind === "progress" ||
            event.kind === "reasoning"))
      )
        setTurnActive(true);

      if (event.event === "turn_end") {
        cancelStreamEndTimer();
        setTurnActive(false);
        setRunStartedAt(null);
        if (event.goal_state) setGoalState(event.goal_state);
        refreshSessionsAfterTurn();
      }
    });
    socket.connect();
    return () => {
      active = false;
      unsubscribeEvents();
      unsubscribeTransportErrors();
      unsubscribeRunStatus();
      unsubscribeStatus();
      cancelCanonicalRetry();
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [
    cancelStreamEndTimer,
    cancelCanonicalRetry,
    flushPendingStreamEvents,
    phase,
    applyStreamError,
    refreshSessions,
    refreshSessionsAfterTurn,
    refreshWorkspaces,
    requestBootstrap,
    scheduleCanonicalReconnect,
    schedulePendingStreamFlush,
    scheduleStreamEndTimer,
  ]);

  const selectSession = useCallback(
    (key: string | null) => {
      cancelCanonicalRetry();
      canonicalRetryAttemptRef.current = 0;
      needsCanonicalReconnectRef.current = false;
      historyRequestVersionRef.current += 1;
      canonicalRequestVersionRef.current += 1;
      uiMutationVersionRef.current += 1;
      resetStreamingRuntime();
      dismissStreamError();
      const selected = key
        ? sessions.find((session) => session.key === key)
        : null;
      const selectedChatId = selected?.chatId ?? chatIdFromKey(key);
      setDraftWorkspaceScope(
        selected?.workspaceScope
          ? normalizeWorkspaceScope(selected.workspaceScope)
          : null,
      );
      setWorkspaceError(null);
      setActiveKey(key);
      activeKeyRef.current = key;
      setMessages([]);
      messagesRef.current = [];
      const selectedRunStartedAt = selectedChatId
        ? (socketRef.current?.getRunStartedAt(selectedChatId) ??
          selected?.runStartedAt ??
          null)
        : null;
      setTurnActive(
        selectedRunStartedAt !== null ||
          Boolean(
            selectedChatId &&
            socketRef.current?.hasUnsettledRun(selectedChatId),
          ),
      );
      setRunStartedAt(selectedRunStartedAt);
      setGoalState(
        selectedChatId
          ? socketRef.current?.getGoalState(selectedChatId)
          : undefined,
      );
      setTurnModelName(null);
      modelPresetOverrideRef.current = null;
      setThreadLoading(Boolean(key));
      setLoadingOlder(false);
      setBeforeCursor(null);
      setHasMoreBefore(false);
      setUserMessageOffset(0);
      setForkBoundaryMessageCount(null);
      if (selectedChatId)
        socketRef.current?.replayDeferredEvents(selectedChatId);
    },
    [cancelCanonicalRetry, dismissStreamError, resetStreamingRuntime, sessions],
  );

  useEffect(() => {
    if (!bootstrap || !activeKey) return;
    const requestVersion = historyRequestVersionRef.current + 1;
    historyRequestVersionRef.current = requestVersion;
    let cancelled = false;
    const chatId = chatIdFromKey(activeKey);
    if (chatId) socketRef.current?.attach(chatId);
    void fetchThread(DEFAULT_SERVER_URL, bootstrap.api_token, activeKey, {
      limit: 160,
      direction: "latest",
    })
      .then((thread) => {
        if (cancelled || historyRequestVersionRef.current !== requestVersion)
          return;
        if (thread) {
          const latest = normalizedMessages(thread.messages);
          if (chatId && thread.workspace_scope) {
            const nextScope = normalizeWorkspaceScope(thread.workspace_scope);
            setWorkspaceOverrides((current) => ({
              ...current,
              [chatId]: nextScope,
            }));
            setDraftWorkspaceScope(nextScope);
          }
          uiMutationVersionRef.current += 1;
          setMessages((current) => mergeLatestMessages(current, latest));
          setBeforeCursor(thread.page?.before_cursor ?? null);
          setHasMoreBefore(Boolean(thread.page?.has_more_before));
          setUserMessageOffset(
            Math.max(0, thread.page?.user_message_offset ?? 0),
          );
          setForkBoundaryMessageCount(
            (current) =>
              current ??
              normalizedForkBoundary(
                thread.messages,
                thread.fork_boundary_message_count,
              ),
          );
        } else {
          setBeforeCursor(null);
          setHasMoreBefore(false);
          setUserMessageOffset(0);
          setForkBoundaryMessageCount(null);
        }
        const threadActive = Boolean(
          thread?.active_turn_id ||
          (thread &&
            (typeof thread.has_pending_tool_calls === "boolean"
              ? thread.has_pending_tool_calls
              : hasPendingAgentActivity(thread.messages))),
        );
        setTurnActive(threadActive);
        if (!threadActive) setRunStartedAt(null);
      })
      .catch((caught) => {
        if (!cancelled)
          setError(
            caught instanceof Error
              ? caught.message
              : i18n.t("chat.loadThreadFailed", {
                  defaultValue: "Could not load the topic",
                }),
          );
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeKey, bootstrap]);

  const loadOlder = useCallback(async () => {
    const key = activeKeyRef.current;
    if (!bootstrap || !key || !beforeCursor || !hasMoreBefore || loadingOlder)
      return;
    const requestKey = key;
    canonicalRequestVersionRef.current += 1;
    setLoadingOlder(true);
    try {
      const thread = await fetchThread(
        DEFAULT_SERVER_URL,
        bootstrap.api_token,
        key,
        {
          limit: 120,
          before: beforeCursor,
        },
      );
      if (activeKeyRef.current !== requestKey || !thread) return;
      const older = normalizedMessages(thread.messages);
      uiMutationVersionRef.current += 1;
      setMessages((current) => prependOlderMessages(current, older));
      setBeforeCursor(thread.page?.before_cursor ?? null);
      setHasMoreBefore(Boolean(thread.page?.has_more_before));
      setUserMessageOffset(Math.max(0, thread.page?.user_message_offset ?? 0));
      const olderBoundary = normalizedForkBoundary(
        thread.messages,
        thread.fork_boundary_message_count,
      );
      setForkBoundaryMessageCount(
        (current) =>
          olderBoundary ?? (current === null ? null : current + older.length),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : i18n.t("thread.loadEarlierFailed", {
              defaultValue: "Could not load earlier messages",
            }),
      );
    } finally {
      if (activeKeyRef.current === requestKey) setLoadingOlder(false);
    }
  }, [beforeCursor, bootstrap, hasMoreBefore, loadingOlder]);

  const forkFromMessage = useCallback(
    async (beforeUserIndex: number) => {
      const key = activeKeyRef.current;
      const socket = socketRef.current;
      if (!key || !socket)
        throw new Error(
          i18n.t("chat.notConnected", {
            defaultValue: "The current topic is not connected yet",
          }),
        );
      const sourceChatId = chatIdFromKey(key);
      if (!sourceChatId)
        throw new Error(
          i18n.t("chat.cannotFork", {
            defaultValue: "The current topic cannot be forked",
          }),
        );
      const sourceSession = sessions.find((session) => session.key === key);
      const sourceTitle = sourceSession
        ? sidebarStateRef.current.title_overrides[key] ||
          sessionTitle(sourceSession)
        : i18n.t("chat.newChat");
      try {
        const title = i18n.t("chat.forkTitle", { title: sourceTitle });
        const forkedChatId = await socket.forkChat(
          sourceChatId,
          beforeUserIndex,
          title,
        );
        const forkedKey = `websocket:${forkedChatId}`;
        const now = new Date().toISOString();
        optimisticSessionKeysRef.current.add(forkedKey);
        setSessions((current) => [
          {
            key: forkedKey,
            channel: "websocket",
            chatId: forkedChatId,
            createdAt: now,
            updatedAt: now,
            title,
            preview: "",
            workspaceScope: null,
          },
          ...current.filter((session) => session.key !== forkedKey),
        ]);
        selectSession(forkedKey);
        void refreshSessions();
        return forkedChatId;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : i18n.t("chat.forkFailed", {
                defaultValue: "Could not fork the topic",
              });
        setError(message);
        throw caught;
      }
    },
    [refreshSessions, selectSession, sessions],
  );

  const updateSidebar = useCallback(
    async (updater: (current: SidebarStatePayload) => SidebarStatePayload) => {
      if (!bootstrap) return;
      const next = updater(sidebarStateRef.current);
      const version = sidebarMutationVersionRef.current + 1;
      sidebarMutationVersionRef.current = version;
      sidebarStateRef.current = next;
      setSidebarState(next);
      try {
        const persisted = await updateSidebarState(
          DEFAULT_SERVER_URL,
          bootstrap.api_token,
          next,
        );
        if (sidebarMutationVersionRef.current !== version) return;
        sidebarStateRef.current = persisted;
        setSidebarState(persisted);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : i18n.t("sidebar.saveStateFailed", {
                defaultValue: "Could not save sidebar state",
              }),
        );
      }
    },
    [bootstrap],
  );

  const togglePinned = useCallback(
    (key: string) =>
      updateSidebar((current) => {
        const pinned = new Set(current.pinned_keys);
        if (pinned.has(key)) pinned.delete(key);
        else pinned.add(key);
        return { ...current, pinned_keys: [...pinned] };
      }),
    [updateSidebar],
  );

  const toggleArchived = useCallback(
    (key: string) =>
      updateSidebar((current) => {
        const archived = new Set(current.archived_keys);
        if (archived.has(key)) archived.delete(key);
        else archived.add(key);
        return {
          ...current,
          archived_keys: [...archived],
          pinned_keys: archived.has(key)
            ? current.pinned_keys.filter((item) => item !== key)
            : current.pinned_keys,
        };
      }),
    [updateSidebar],
  );

  const renameSession = useCallback(
    (key: string, rawTitle: string) => {
      const title = rawTitle.trim();
      return updateSidebar((current) => {
        const titleOverrides = { ...current.title_overrides };
        if (title) titleOverrides[key] = title;
        else delete titleOverrides[key];
        return { ...current, title_overrides: titleOverrides };
      });
    },
    [updateSidebar],
  );

  const toggleSidebarGroup = useCallback(
    (groupId: string) =>
      updateSidebar((current) => {
        const collapsedGroups = { ...current.collapsed_groups };
        if (groupId === "workspace:chats" || groupId === "date:all") {
          if (collapsedGroups[groupId] === false)
            delete collapsedGroups[groupId];
          else collapsedGroups[groupId] = false;
        } else if (collapsedGroups[groupId]) {
          delete collapsedGroups[groupId];
        } else {
          collapsedGroups[groupId] = true;
        }
        return { ...current, collapsed_groups: collapsedGroups };
      }),
    [updateSidebar],
  );

  const renameProject = useCallback(
    (projectKey: string, rawTitle: string) => {
      const title = rawTitle.trim();
      return updateSidebar((current) => {
        const projectNameOverrides = { ...current.project_name_overrides };
        if (title) projectNameOverrides[projectKey] = title;
        else delete projectNameOverrides[projectKey];
        return { ...current, project_name_overrides: projectNameOverrides };
      });
    },
    [updateSidebar],
  );

  const setShowArchived = useCallback(
    (show: boolean) =>
      updateSidebar((current) => ({
        ...current,
        view: { ...current.view, show_archived: show },
      })),
    [updateSidebar],
  );

  const removeSession = useCallback(
    async (
      key: string,
      options?: { deleteAutomations?: boolean },
    ): Promise<SessionDeleteResult> => {
      if (!bootstrap) return { deleted: false };
      const result = await deleteSession(
        DEFAULT_SERVER_URL,
        bootstrap.api_token,
        key,
        options,
      );
      if (!result.deleted) return result;
      optimisticSessionKeysRef.current.delete(key);
      setSessions((current) =>
        current.filter((session) => session.key !== key),
      );
      await updateSidebar((current) => {
        const titleOverrides = { ...current.title_overrides };
        const projectOverrides = { ...current.project_name_overrides };
        const tagsByKey = { ...current.tags_by_key };
        delete titleOverrides[key];
        delete projectOverrides[key];
        delete tagsByKey[key];
        return {
          ...current,
          pinned_keys: current.pinned_keys.filter((item) => item !== key),
          archived_keys: current.archived_keys.filter((item) => item !== key),
          title_overrides: titleOverrides,
          project_name_overrides: projectOverrides,
          tags_by_key: tagsByKey,
        };
      });
      if (activeKeyRef.current === key) selectSession(null);
      return result;
    },
    [bootstrap, selectSession, updateSidebar],
  );

  const getSessionAutomations = useCallback(
    async (key: string): Promise<SessionAutomationJob[]> => {
      if (!bootstrap) return [];
      const payload = await fetchSessionAutomations(
        DEFAULT_SERVER_URL,
        bootstrap.api_token,
        key,
      );
      return payload.jobs;
    },
    [bootstrap],
  );

  const activeChatId = activeSession?.chatId ?? chatIdFromKey(activeKey);
  const activeWorkspaceScope: WorkspaceScopePayload | null =
    activeChatId && workspaceOverrides[activeChatId]
      ? workspaceOverrides[activeChatId]
      : activeSession?.workspaceScope
        ? normalizeWorkspaceScope(activeSession.workspaceScope)
        : (draftWorkspaceScope ?? workspaces?.default_scope ?? null);

  const startNewChat = useCallback(() => {
    selectSession(null);
    setDraftWorkspaceScope(null);
    setWorkspaceError(null);
  }, [selectSession]);

  const startNewChatInProject = useCallback(
    (projectPath: string, projectName: string) => {
      const base = workspaces?.default_scope ?? activeWorkspaceScope;
      const path = projectPath.trim();
      if (!base || !path) {
        startNewChat();
        return;
      }
      selectSession(null);
      setDraftWorkspaceScope(
        normalizeWorkspaceScope({
          project_path: path,
          project_name: projectName.trim() || projectNameFromPath(path),
          access_mode: base.access_mode,
          restrict_to_workspace: base.access_mode === "restricted",
        }),
      );
      setWorkspaceError(null);
    },
    [
      activeWorkspaceScope,
      selectSession,
      startNewChat,
      workspaces?.default_scope,
    ],
  );

  const updateWorkspaceScope = useCallback(
    (scope: WorkspaceScopePayload) => {
      const nextScope = normalizeWorkspaceScope(scope);
      setWorkspaceError(null);
      if (activeChatId) {
        if (!turnActive)
          socketRef.current?.setWorkspaceScope(activeChatId, nextScope);
        return;
      }
      setDraftWorkspaceScope(nextScope);
    },
    [activeChatId, turnActive],
  );

  const sendHiddenSystemCommand = useCallback(
    async (
      chatId: string,
      command: string,
      timeoutMs = 5_000,
    ): Promise<void> => {
      const socket = socketRef.current;
      if (!socket) throw new Error(i18n.t("connection.closed"));
      await socket.sendSystemCommand(chatId, command, timeoutMs);
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      rawContent: string,
      attachments: SendAttachment[] = [],
      options: SendMessageOptions = {},
    ) => {
      const content = rawContent.trim();
      const quotedContext = normalizeQuotedContext(options.quotedContext);
      const normalizedOptions: SendMessageOptions = quotedContext
        ? { ...options, quotedContext }
        : { ...options, quotedContext: undefined };
      const outboundContent = quotedContext
        ? formatQuotedUserMessage(content, quotedContext)
        : content;
      const socket = socketRef.current;
      if (
        (!outboundContent && attachments.length === 0) ||
        !socket ||
        !bootstrap
      )
        return;
      const sideChannel = normalizedOptions.sideChannel === true;
      const finalizeActiveTurn = normalizedOptions.finalizeActiveTurn === true;
      const continueActiveTurn = normalizedOptions.continueActiveTurn === true;
      const workspaceScope = normalizedOptions.workspaceScope
        ? normalizeWorkspaceScope(normalizedOptions.workspaceScope)
        : activeWorkspaceScope
          ? normalizeWorkspaceScope(activeWorkspaceScope)
          : null;
      let key = activeKeyRef.current;
      let chatId = chatIdFromKey(key) ?? "";
      if (!chatId) {
        chatId = await socket.newChat(5_000, workspaceScope);
        const newKey = `websocket:${chatId}`;
        key = newKey;
        const now = new Date().toISOString();
        optimisticSessionKeysRef.current.add(newKey);
        setSessions((current) => [
          {
            key: newKey,
            channel: "websocket",
            chatId,
            createdAt: now,
            updatedAt: now,
            title: "",
            preview: "",
            workspaceScope,
          },
          ...current.filter((session) => session.key !== key),
        ]);
        if (workspaceScope) {
          setWorkspaceOverrides((current) => ({
            ...current,
            [chatId]: workspaceScope,
          }));
          setDraftWorkspaceScope(workspaceScope);
        }
        setActiveKey(key);
        activeKeyRef.current = key;
        setRunStartedAt(null);
        setGoalState(socket.getGoalState(chatId));
        setTurnModelName(null);
        const requestedPreset = modelPresetOverrideRef.current;
        if (requestedPreset) {
          await sendHiddenSystemCommand(chatId, `/model ${requestedPreset}`);
          setSessions((current) =>
            current.map((session) =>
              session.key === key
                ? { ...session, modelPreset: requestedPreset }
                : session,
            ),
          );
        }
      }
      validateOutboundMessage(bootstrap, chatId, outboundContent, attachments, {
        ...normalizedOptions,
        workspaceScope,
      });
      flushPendingStreamEvents();
      if (finalizeActiveTurn) {
        cancelStreamEndTimer();
        setTurnActive(false);
        setRunStartedAt(null);
      }
      uiMutationVersionRef.current += 1;
      const send = socket.sendMessage(
        chatId,
        outboundContent,
        attachments.length ? attachments.map((item) => item.media) : undefined,
        {
          cliApps: normalizedOptions.cliApps,
          mcpPresets: normalizedOptions.mcpPresets,
          workspaceScope,
          startsNewRun: !(sideChannel || continueActiveTurn),
        },
      );
      if (sideChannel) sideChannelTurnIdsRef.current.add(send.turnId);
      setMessages((current) => {
        let base = current;
        if (finalizeActiveTurn) {
          base = finalizeStreamedTurn(base);
          resetStreamFoldState(streamFoldRef.current);
        } else if (!sideChannel && !continueActiveTurn) {
          prepareStreamFoldForUserTurn(streamFoldRef.current);
        }
        return [
          ...base,
          optimisticUserMessage(
            outboundContent,
            send.turnId,
            attachments,
            normalizedOptions,
          ),
        ];
      });
      if (!sideChannel) setTurnActive(true);
      try {
        await send.accepted;
      } catch (caught) {
        sideChannelTurnIdsRef.current.delete(send.turnId);
        setMessages((current) =>
          current.filter((message) => message.turnId !== send.turnId),
        );
        if (!sideChannel && !continueActiveTurn) {
          setTurnActive(false);
          setRunStartedAt(null);
        }
        const correlatedError =
          lastStreamErrorRef.current?.turnId === send.turnId;
        if (!correlatedError) {
          setError(
            caught instanceof Error
              ? caught.message
              : i18n.t("thread.sendFailed", {
                  defaultValue: "Could not send the message",
                }),
          );
        }
        throw caught;
      }
    },
    [
      activeWorkspaceScope,
      bootstrap,
      cancelStreamEndTimer,
      flushPendingStreamEvents,
      sendHiddenSystemCommand,
    ],
  );

  const changeModelPreset = useCallback(
    async (name: string): Promise<void> => {
      const normalized = name.trim();
      if (!normalized)
        throw new Error(
          i18n.t("settings.models.invalidPreset", {
            defaultValue: "Invalid model preset",
          }),
        );
      const previous = modelPresetOverrideRef.current;
      modelPresetOverrideRef.current = normalized;
      const key = activeKeyRef.current;
      const chatId = chatIdFromKey(key);
      if (!chatId) return;
      try {
        await sendHiddenSystemCommand(chatId, `/model ${normalized}`);
        if (key) {
          setSessions((current) =>
            current.map((session) =>
              session.key === key
                ? { ...session, modelPreset: normalized }
                : session,
            ),
          );
        }
      } catch (caught) {
        if (modelPresetOverrideRef.current === normalized) {
          modelPresetOverrideRef.current = previous;
        }
        throw caught;
      }
    },
    [sendHiddenSystemCommand],
  );

  const stopTurn = useCallback(() => {
    const key = activeKeyRef.current;
    const socket = socketRef.current;
    if (!key || !socket) return;
    const chatId = chatIdFromKey(key);
    if (!chatId) return;
    flushPendingStreamEvents();
    cancelStreamEndTimer();
    setTurnActive(false);
    setRunStartedAt(null);
    setMessages((current) => {
      resetStreamFoldState(streamFoldRef.current);
      return current.map((message) =>
        message.isStreaming
          ? { ...message, isStreaming: false, reasoningStreaming: false }
          : message,
      );
    });
    uiMutationVersionRef.current += 1;
    const stop = socket.sendMessage(chatId, "/stop", undefined, {
      startsNewRun: false,
    });
    sideChannelTurnIdsRef.current.add(stop.turnId);
    void stop.accepted.catch(() => {
      sideChannelTurnIdsRef.current.delete(stop.turnId);
      // Stopping is best-effort; the socket banner already exposes transport errors.
    });
  }, [cancelStreamEndTimer, flushPendingStreamEvents]);

  const transcribeAudio = useCallback(
    (dataUrl: string, options?: { durationMs?: number }) => {
      const socket = socketRef.current;
      if (!socket)
        return Promise.reject(new Error(i18n.t("connection.closed")));
      return socket.transcribeAudio(dataUrl, options);
    },
    [],
  );

  const retryFromMessage = useCallback(
    async (messageId: string) => {
      const socket = socketRef.current;
      const key = activeKeyRef.current;
      const chatId = chatIdFromKey(key);
      if (!socket || !chatId || !bootstrap) return;
      if (turnActiveRef.current) return;
      const all = messagesRef.current;
      const index = all.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      const target = all[index];
      if (!target || target.role !== 'assistant' || target.kind === 'trace') return;
      // No further user prompts after the assistant reply → still safe to retry.
      const tailHasUserPrompt = all.slice(index + 1).some(
        (message) => message.role === 'user',
      );
      if (tailHasUserPrompt) return;
      const turnId = target.turnId;
      // Drop the prior assistant reply and any trailing reasoning/trace rows
      // that belong to it so the model regenerates a clean answer.
      const cutoff = (() => {
        let boundary = index;
        for (let scan = index - 1; scan >= 0; scan -= 1) {
          const prev = all[scan];
          if (prev.role === 'user') break;
          if (prev.turnId && turnId && prev.turnId === turnId) {
            boundary = scan;
          }
        }
        return boundary;
      })();
      flushPendingStreamEvents();
      cancelStreamEndTimer();
      resetStreamFoldState(streamFoldRef.current);
      uiMutationVersionRef.current += 1;
      setMessages((current) => {
        const trimmed = current.slice(0, cutoff);
        const tail = current.slice(cutoff);
        const reusedPrefix: UIMessage[] = [];
        for (const row of tail) {
          if (row.role === 'assistant' && row.kind === 'trace') {
            reusedPrefix.push(row);
            continue;
          }
          if (row === target) continue;
          reusedPrefix.push(row);
        }
        return [...trimmed, ...reusedPrefix];
      });
      const send = socket.sendMessage(
        chatId,
        '\n[retry]',
        undefined,
        { startsNewRun: false },
      );
      sideChannelTurnIdsRef.current.add(send.turnId);
      setTurnActive(true);
      void send.accepted.catch((caught) => {
        sideChannelTurnIdsRef.current.delete(send.turnId);
        setError(
          caught instanceof Error
            ? caught.message
            : i18n.t('message.retryFailed', {
                defaultValue: 'Could not retry this message',
              }),
        );
      });
    },
    [
      bootstrap,
      cancelStreamEndTimer,
      flushPendingStreamEvents,
      setError,
      setMessages,
      setTurnActive,
    ],
  );

  const restartServer = useCallback(() => {
    const runtimePolicy = resolveRuntimeClientPolicy(bootstrapRef.current);
    if (!runtimePolicy.canRestart) {
      setError(
        runtimePolicy.restartUnavailableReason ??
          i18n.t("app.system.restartUnavailable", {
            defaultValue: "This client cannot restart nanobot",
          }),
      );
      return;
    }
    const socket = socketRef.current;
    if (!socket) return;
    const activeChatId = chatIdFromKey(activeKeyRef.current);
    const chatId = activeChatId || sessions[0]?.chatId || "";
    if (!chatId) {
      setError(
        i18n.t("app.system.restartNeedsTopic", {
          defaultValue: "No topic is available to restart nanobot",
        }),
      );
      return;
    }
    const restart = socket.sendMessage(chatId, "/restart", undefined, {
      startsNewRun: false,
    });
    sideChannelTurnIdsRef.current.add(restart.turnId);
    void restart.accepted.catch((caught) => {
      sideChannelTurnIdsRef.current.delete(restart.turnId);
      setError(
        caught instanceof Error
          ? caught.message
          : i18n.t("app.system.restartFailed", {
              defaultValue: "Could not restart nanobot",
            }),
      );
    });
  }, [sessions]);

  const logout = useCallback(async () => {
    cancelCanonicalRetry();
    resetStreamingRuntime();
    canonicalRequestVersionRef.current += 1;
    uiMutationVersionRef.current += 1;
    hasOpenedSocketRef.current = false;
    needsCanonicalReconnectRef.current = false;
    socketRef.current?.close();
    await clearBootstrapSecret();
    secretRef.current = "";
    setBootstrap(null);
    optimisticSessionKeysRef.current.clear();
    setSessions([]);
    setSlashCommands([]);
    setCliApps([]);
    setMcpPresets([]);
    setSkills([]);
    setWorkspaces(null);
    setWorkspaceError(null);
    setDraftWorkspaceScope(null);
    setWorkspaceOverrides({});
    setMessages([]);
    messagesRef.current = [];
    setActiveKey(null);
    activeKeyRef.current = null;
    setTurnActive(false);
    setRunStartedAt(null);
    setGoalState(undefined);
    setRuntimeModelName(null);
    setTurnModelName(null);
    setModelSettingsRevision(0);
    modelPresetOverrideRef.current = null;
    setAuthenticationFailed(false);
    setError(null);
    // Re-bootstrap with the cached credential when one exists; otherwise
    // surface the auth screen so the user can re-enter the runtime password.
    const cachedSecret = secretRef.current || await loadBootstrapSecret();
    if (!cachedSecret) {
      setPhase("authentication");
      return;
    }
    setPhase("booting");
    try {
      await requestBootstrap(cachedSecret, false);
    } catch (caught) {
      if (caught instanceof BootstrapAuthRequiredError) {
        await clearBootstrapSecret();
        setPhase("authentication");
        return;
      }
      setError(
        caught instanceof Error ? caught.message : i18n.t("app.error.title"),
      );
      setPhase("unreachable");
    }
  }, [cancelCanonicalRetry, resetStreamingRuntime, requestBootstrap]);

  const retryConnection = useCallback(async () => {
    const secret = secretRef.current || (await loadBootstrapSecret());
    if (!secret) {
      setPhase("authentication");
      return;
    }
    setPhase("booting");
    try {
      await requestBootstrap(secret, false);
    } catch (caught) {
      if (caught instanceof BootstrapAuthRequiredError) {
        await clearBootstrapSecret();
        setPhase("authentication");
        return;
      }
      setError(
        caught instanceof Error ? caught.message : i18n.t("app.error.title"),
      );
      setPhase("unreachable");
    }
  }, [requestBootstrap]);

  useEffect(() => {
    turnActiveRef.current = turnActive;
  }, [turnActive]);

  return {
    phase,
    bootstrap,
    authenticationFailed,
    error,
    clearError: () => setError(null),
    streamError,
    dismissStreamError,
    connectionStatus,
    sessions,
    sidebarState,
    sessionsLoading,
    activeKey,
    activeSession,
    activeWorkspaceScope,
    workspaces,
    workspaceError,
    messages,
    threadLoading,
    loadingOlder,
    hasMoreBefore,
    userMessageOffset,
    forkBoundaryMessageCount,
    turnActive,
    runStartedAt,
    goalState,
    runtimeModelName,
    turnModelName,
    modelSettingsRevision,
    slashCommands,
    cliApps,
    mcpPresets,
    skills,
    applyCliAppsPayload,
    applyMcpPresetsPayload,
    authenticate,
    retryConnection,
    refreshSessions,
    selectSession,
    startNewChat,
    startNewChatInProject,
    loadOlder,
    forkFromMessage,
    updateWorkspaceScope,
    changeModelPreset,
    sendMessage,
    transcribeAudio,
    stopTurn,
    restartServer,
    retryFromMessage,
    togglePinned,
    toggleArchived,
    toggleSidebarGroup,
    renameSession,
    renameProject,
    setShowArchived,
    getSessionAutomations,
    removeSession,
    logout,
  };
}
