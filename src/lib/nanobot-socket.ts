import type {
  ConnectionStatus,
  GoalStateWsPayload,
  InboundEvent,
  OutboundMedia,
  StreamError,
  UICliAppAttachment,
  UIMcpPresetAttachment,
  WorkspaceScopePayload,
} from "@/types/nanobot";

import i18n from "@/i18n";

type StatusListener = (status: ConnectionStatus) => void;
type EventListener = (event: InboundEvent) => void;
type RunStatusListener = (chatId: string, startedAt: number | null) => void;
type TransportErrorListener = (error: NanobotTransportError) => void;
type Reauthenticate = () => Promise<string | null>;

type OutboundFrame =
  | { type: "new_chat"; workspace_scope?: WorkspaceScopePayload }
  | {
      type: "fork_chat";
      source_chat_id: string;
      before_user_index: number;
      title?: string;
    }
  | { type: "attach"; chat_id: string }
  | {
      type: "set_workspace_scope";
      chat_id: string;
      workspace_scope: WorkspaceScopePayload;
    }
  | {
      type: "message";
      chat_id: string;
      content: string;
      media?: OutboundMedia[];
      cli_apps?: UICliAppAttachment[];
      mcp_presets?: UIMcpPresetAttachment[];
      quoted_context?: string;
      workspace_scope?: WorkspaceScopePayload;
      turn_id: string;
      webui: true;
    }
  | {
      type: "transcribe_audio";
      request_id: string;
      data_url: string;
      duration_ms?: number;
    };

type PendingMessageState = "queued" | "sent" | "unknown" | "accepted";

interface PendingMessageSend {
  chatId: string;
  turnId: string;
  startsNewRun: boolean;
  state: PendingMessageState;
  resolve: () => void;
  reject: (error: Error) => void;
  acceptanceSettled: boolean;
}

interface PendingTranscription {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingSystemCommand {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface MessageSendResult {
  turnId: string;
  accepted: Promise<void>;
}

export interface CanonicalRunSnapshot {
  observedTurnIds: readonly string[];
  hasPendingToolCalls: boolean;
  activeTurnId?: string | null;
}

export type NanobotTransportError = StreamError;

const TURN_REJECTION_DETAILS = new Set([
  "access_denied",
  "attachment_rejected",
  "message_rejected",
  "missing content",
  "workspace_scope_rejected",
]);
const COMPLETED_TURN_FENCE_MAX = 256;
const PENDING_INBOUND_MAX = 2_000;
const SYSTEM_COMMAND_TURN_PREFIX = "webui-system:";

function createTurnId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function eventTurnId(event: InboundEvent): string | null {
  return "turn_id" in event && typeof event.turn_id === "string"
    ? event.turn_id
    : null;
}

function isSystemCommandTurnId(
  value: string | null | undefined,
): value is string {
  return (
    typeof value === "string" && value.startsWith(SYSTEM_COMMAND_TURN_PREFIX)
  );
}

export class NanobotSocket {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = "idle";
  private statusListeners = new Set<StatusListener>();
  private eventListeners = new Set<EventListener>();
  private pendingInboundByChat = new Map<string, InboundEvent[]>();
  private runStatusListeners = new Set<RunStatusListener>();
  private transportErrorListeners = new Set<TransportErrorListener>();
  private knownChats = new Set<string>();
  private sendQueue: OutboundFrame[] = [];
  private pendingMessageSends = new Map<string, PendingMessageSend>();
  private pendingTranscriptions = new Map<string, PendingTranscription>();
  private pendingSystemCommands = new Map<string, PendingSystemCommand>();
  private socketPendingMessageSendKeys = new Set<string>();
  private lastSocketMessageSendKey: string | null = null;
  private runStartedAtByChatId = new Map<string, number>();
  private runStartedAtByTurnKey = new Map<string, number>();
  private runGenerationByChatId = new Map<string, number>();
  private latestRunTurnIdByChatId = new Map<string, string>();
  private unsettledRunTurnIdsByChatId = new Map<string, Set<string>>();
  private canonicalCompletedTurnIdsByChatId = new Map<string, Set<string>>();
  private goalStateByChatId = new Map<string, GoalStateWsPayload>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private maxFrameBytes: number | undefined;
  private pendingNewChat: {
    resolve: (chatId: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(
    private currentUrl: string,
    private readonly reauthenticate: Reauthenticate,
    maxFrameBytes?: number,
  ) {
    this.maxFrameBytes = this.normalizeMaxFrameBytes(maxFrameBytes);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  deferInboundEvent(event: InboundEvent): void {
    const chatId =
      "chat_id" in event && typeof event.chat_id === "string"
        ? event.chat_id
        : null;
    if (!chatId) return;
    const pending = this.pendingInboundByChat.get(chatId) ?? [];
    pending.push(event);
    const overflow = pending.length - PENDING_INBOUND_MAX;
    if (overflow > 0) pending.splice(0, overflow);
    this.pendingInboundByChat.set(chatId, pending);
  }

  replayDeferredEvents(chatId: string): void {
    const pending = this.pendingInboundByChat.get(chatId);
    if (!pending?.length) return;
    this.pendingInboundByChat.delete(chatId);
    for (const event of pending) this.emitEvent(event);
  }

  onRunStatus(listener: RunStatusListener): () => void {
    this.runStatusListeners.add(listener);
    for (const [chatId, startedAt] of this.runStartedAtByChatId) {
      listener(chatId, startedAt);
    }
    return () => this.runStatusListeners.delete(listener);
  }

  onTransportError(listener: TransportErrorListener): () => void {
    this.transportErrorListeners.add(listener);
    return () => this.transportErrorListeners.delete(listener);
  }

  getRunStartedAt(chatId: string): number | null {
    return this.runStartedAtByChatId.get(chatId) ?? null;
  }

  getRunGeneration(chatId: string): number {
    return this.runGenerationByChatId.get(chatId) ?? 0;
  }

  hasUnsettledRun(chatId: string): boolean {
    return (this.unsettledRunTurnIdsByChatId.get(chatId)?.size ?? 0) > 0;
  }

  getGoalState(chatId: string): GoalStateWsPayload | undefined {
    return this.goalStateByChatId.get(chatId);
  }

  updateUrl(url: string): void {
    this.currentUrl = url;
  }

  updateMaxFrameBytes(maxFrameBytes?: number): void {
    this.maxFrameBytes = this.normalizeMaxFrameBytes(maxFrameBytes);
  }

  connect(): void {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) return;
    this.intentionallyClosed = false;
    this.setStatus("connecting");
    const socket = new WebSocket(this.currentUrl);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus("open");
      for (const chatId of this.knownChats)
        this.rawSend({ type: "attach", chat_id: chatId });
      for (const frame of this.sendQueue.splice(0)) this.rawSend(frame);
    };
    socket.onmessage = (message) => {
      if (typeof message.data !== "string") return;
      try {
        let event = JSON.parse(message.data) as InboundEvent;
        if (event.event === "transcription_result") {
          this.resolveTranscription(event.request_id, event.text);
          return;
        }
        if (event.event === "transcription_error") {
          this.rejectTranscription(
            event.request_id,
            event.detail,
            event.provider,
          );
          return;
        }
        if (event.event === "error" && !event.turn_id) {
          const fallback = this.legacyRejectionTarget(event);
          if (fallback) {
            event = {
              ...event,
              chat_id: event.chat_id ?? fallback.chatId,
              turn_id: fallback.turnId,
            };
          }
        }
        if (
          (event.event === "goal_status" || event.event === "turn_end") &&
          !event.turn_id
        ) {
          const fallbackTurnId = this.uniqueUnsettledTurnId(event.chat_id);
          if (fallbackTurnId) event = { ...event, turn_id: fallbackTurnId };
        }

        const turnId = eventTurnId(event);
        if (event.event === "message_accepted") {
          this.recordRunAcceptance(event.chat_id, event.turn_id);
          return;
        }
        if (isSystemCommandTurnId(turnId)) {
          if (event.event === "error") {
            this.rejectSystemCommand(
              turnId,
              new Error(
                [event.detail, event.reason].filter(Boolean).join(": ") ||
                  i18n.t("app.error.serverError", {
                    defaultValue: "The server returned an error",
                  }),
              ),
            );
          } else if (event.event === "message" || event.event === "turn_end") {
            this.resolveSystemCommand(turnId);
          }
          return;
        }

        const chatId =
          "chat_id" in event && typeof event.chat_id === "string"
            ? event.chat_id
            : null;
        if (event.event === "error" && chatId && turnId) {
          this.recordRunRejection(
            chatId,
            turnId,
            new Error(
              [event.detail, event.reason].filter(Boolean).join(": ") ||
                i18n.t("errors.turnRejected.title"),
            ),
          );
          if (event.detail !== "workspace_scope_rejected") {
            this.emitTransportError({
              kind: "turn_rejected",
              chatId,
              turnId,
              detail: event.detail,
              reason: event.reason,
            });
          }
        } else if (event.event !== "error" && chatId && turnId) {
          this.recordRunAcceptance(chatId, turnId);
        }

        if (
          event.event === "error" &&
          event.detail === "workspace_scope_rejected"
        ) {
          this.emitTransportError({
            kind: "workspace_scope_rejected",
            chatId: event.chat_id,
            turnId: event.turn_id,
            reason: event.reason,
          });
        }

        if (event.event === "error" && this.pendingNewChat) {
          clearTimeout(this.pendingNewChat.timer);
          this.pendingNewChat.reject(
            new Error(
              [event.detail, event.reason].filter(Boolean).join(": ") ||
                i18n.t("chat.createFailed", {
                  defaultValue: "Could not create the topic",
                }),
            ),
          );
          this.pendingNewChat = null;
        }
        if (event.event === "ready" && event.chat_id) {
          this.knownChats.add(event.chat_id);
          return;
        }
        if (event.event === "attached" && event.chat_id) {
          this.knownChats.add(event.chat_id);
          if (this.pendingNewChat) {
            clearTimeout(this.pendingNewChat.timer);
            this.pendingNewChat.resolve(event.chat_id);
            this.pendingNewChat = null;
          }
        }

        if (chatId && this.isCanonicalCompletedTurnEvent(chatId, event)) return;
        const supersededCompletion = chatId
          ? this.isSupersededRunCompletion(chatId, event)
          : false;
        if (chatId) this.recordRunLifecycle(chatId, event);
        if (supersededCompletion) return;
        if (chatId) this.recordGoalStateSnapshot(chatId, event);
        this.emitEvent(event);
      } catch {
        // Ignore malformed gateway frames and keep the transport alive.
      }
    };
    socket.onerror = () => this.setStatus("error");
    socket.onclose = (event) => this.handleClose(event.code);
  }

  close(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.pendingNewChat) {
      clearTimeout(this.pendingNewChat.timer);
      this.pendingNewChat.reject(new Error(i18n.t("connection.closed")));
      this.pendingNewChat = null;
    }
    for (const pending of [...this.pendingMessageSends.values()]) {
      this.rejectPendingMessage(
        pending,
        new Error(i18n.t("connection.closed")),
      );
    }
    this.rejectAllTranscriptions(new Error(i18n.t("connection.closed")));
    this.rejectAllSystemCommands(new Error(i18n.t("connection.closed")));
    this.sendQueue = [];
    this.socketPendingMessageSendKeys.clear();
    this.lastSocketMessageSendKey = null;
    this.socket?.close();
    this.socket = null;
    this.setStatus("closed");
  }

  attach(chatId: string): void {
    this.knownChats.add(chatId);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.queueSend({ type: "attach", chat_id: chatId });
    }
  }

  newChat(
    timeoutMs = 5_000,
    workspaceScope?: WorkspaceScopePayload | null,
  ): Promise<string> {
    if (this.pendingNewChat)
      return Promise.reject(new Error("newChat already in flight"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingNewChat = null;
        reject(
          new Error(
            i18n.t("chat.createTimeout", {
              defaultValue: "Creating the topic timed out",
            }),
          ),
        );
      }, timeoutMs);
      this.pendingNewChat = { resolve, reject, timer };
      this.queueSend({
        type: "new_chat",
        ...(workspaceScope ? { workspace_scope: workspaceScope } : {}),
      });
    });
  }

  sendSystemCommand(
    chatId: string,
    command: string,
    timeoutMs = 5_000,
  ): Promise<void> {
    const normalized = command.trim();
    if (!normalized)
      return Promise.reject(
        new Error(
          i18n.t("app.error.invalidSystemCommand", {
            defaultValue: "Invalid system command",
          }),
        ),
      );
    const turnId = `${SYSTEM_COMMAND_TURN_PREFIX}${createTurnId()}`;
    this.knownChats.add(chatId);
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSystemCommands.delete(turnId);
        reject(
          new Error(
            i18n.t("settings.models.switchTimeout", {
              defaultValue: "Switching models timed out. Try again.",
            }),
          ),
        );
      }, timeoutMs);
      this.pendingSystemCommands.set(turnId, { resolve, reject, timer });
      this.queueSend({
        type: "message",
        chat_id: chatId,
        content: normalized,
        turn_id: turnId,
        webui: true,
      });
    });
  }

  transcribeAudio(
    dataUrl: string,
    options?: { durationMs?: number; timeoutMs?: number },
  ): Promise<string> {
    const requestId = createTurnId();
    const timeoutMs = options?.timeoutMs ?? 120_000;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTranscriptions.delete(requestId);
        this.removeQueuedTranscription(requestId);
        reject(new Error("transcription_timeout"));
      }, timeoutMs);
      this.pendingTranscriptions.set(requestId, { resolve, reject, timer });
      this.queueSend({
        type: "transcribe_audio",
        request_id: requestId,
        data_url: dataUrl,
        ...(options?.durationMs !== undefined
          ? { duration_ms: options.durationMs }
          : {}),
      });
    });
  }

  setWorkspaceScope(
    chatId: string,
    workspaceScope: WorkspaceScopePayload,
  ): void {
    this.knownChats.add(chatId);
    this.queueSend({
      type: "set_workspace_scope",
      chat_id: chatId,
      workspace_scope: workspaceScope,
    });
  }

  forkChat(
    sourceChatId: string,
    beforeUserIndex: number,
    title?: string,
    timeoutMs = 5_000,
  ): Promise<string> {
    if (this.pendingNewChat)
      return Promise.reject(new Error("newChat already in flight"));
    if (
      !sourceChatId.trim() ||
      !Number.isInteger(beforeUserIndex) ||
      beforeUserIndex < 0
    ) {
      return Promise.reject(
        new Error(
          i18n.t("chat.invalidForkPosition", {
            defaultValue: "Invalid fork position",
          }),
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingNewChat = null;
        reject(
          new Error(
            i18n.t("chat.forkTimeout", {
              defaultValue: "Forking the topic timed out",
            }),
          ),
        );
      }, timeoutMs);
      this.pendingNewChat = { resolve, reject, timer };
      this.queueSend({
        type: "fork_chat",
        source_chat_id: sourceChatId,
        before_user_index: beforeUserIndex,
        ...(title?.trim() ? { title: title.trim() } : {}),
      });
    });
  }

  sendMessage(
    chatId: string,
    content: string,
    media?: OutboundMedia[],
    options: {
      cliApps?: UICliAppAttachment[];
      mcpPresets?: UIMcpPresetAttachment[];
      quotedContext?: string;
      workspaceScope?: WorkspaceScopePayload | null;
      startsNewRun?: boolean;
    } = {},
  ): MessageSendResult {
    const turnId = createTurnId();
    const startsNewRun = options.startsNewRun !== false;
    this.knownChats.add(chatId);
    let resolveAccepted!: () => void;
    let rejectAccepted!: (error: Error) => void;
    const accepted = new Promise<void>((resolve, reject) => {
      resolveAccepted = resolve;
      rejectAccepted = reject;
    });
    const pending: PendingMessageSend = {
      chatId,
      turnId,
      startsNewRun,
      state: "queued",
      resolve: resolveAccepted,
      reject: rejectAccepted,
      acceptanceSettled: false,
    };
    this.pendingMessageSends.set(this.runSendKey(chatId, turnId), pending);
    if (startsNewRun) this.advanceRunGeneration(chatId, turnId);
    const frame: OutboundFrame = {
      type: "message",
      chat_id: chatId,
      content,
      ...(media?.length ? { media } : {}),
      ...(options.cliApps?.length ? { cli_apps: options.cliApps } : {}),
      ...(options.mcpPresets?.length
        ? { mcp_presets: options.mcpPresets }
        : {}),
      ...(options.quotedContext?.trim()
        ? { quoted_context: options.quotedContext.trim() }
        : {}),
      ...(options.workspaceScope
        ? { workspace_scope: options.workspaceScope }
        : {}),
      turn_id: turnId,
      webui: true,
    };
    if (!this.frameFitsTransport(frame)) {
      const error = new Error(
        i18n.t("thread.composer.imageRejected.transport_too_large"),
      );
      this.recordRunRejection(chatId, turnId, error);
      this.emitTransportError({ kind: "message_too_big", chatId, turnId });
      return { turnId, accepted };
    }
    this.queueSend(frame);
    return { turnId, accepted };
  }

  canReconcileCanonicalCompletion(
    chatId: string,
    expectedRunGeneration: number,
    completedTurnIds: readonly string[],
    snapshot?: CanonicalRunSnapshot,
  ): boolean {
    const completed = new Set(
      this.canonicalCompletedTurnIdsByChatId.get(chatId),
    );
    for (const turnId of completedTurnIds) if (turnId) completed.add(turnId);
    const observed = new Set(snapshot?.observedTurnIds.filter(Boolean) ?? []);
    const willSettle = (turnId: string) =>
      this.canonicalTurnWillSettle(
        chatId,
        turnId,
        completed,
        observed,
        snapshot,
      );
    const latestRunTurnId = this.latestRunTurnIdByChatId.get(chatId);
    const latestRunIsRepresented = Boolean(
      latestRunTurnId &&
      (completed.has(latestRunTurnId) ||
        (observed.has(latestRunTurnId) && willSettle(latestRunTurnId))),
    );
    const unsettled = this.unsettledRunTurnIdsByChatId.get(chatId);
    const hasUnrepresentedTurn = Boolean(
      unsettled && [...unsettled].some((turnId) => !willSettle(turnId)),
    );
    const hasUnidentifiedActiveRun =
      this.runStartedAtByChatId.has(chatId) &&
      !latestRunTurnId &&
      (!snapshot || snapshot.hasPendingToolCalls);
    if (hasUnrepresentedTurn || hasUnidentifiedActiveRun) return false;
    return (
      this.getRunGeneration(chatId) === expectedRunGeneration ||
      latestRunIsRepresented
    );
  }

  reconcileCanonicalCompletion(
    chatId: string,
    expectedRunGeneration: number,
    completedTurnIds: readonly string[],
    snapshot?: CanonicalRunSnapshot,
  ): boolean {
    const fences =
      this.canonicalCompletedTurnIdsByChatId.get(chatId) ?? new Set<string>();
    for (const turnId of completedTurnIds) if (turnId) fences.add(turnId);
    while (fences.size > COMPLETED_TURN_FENCE_MAX) {
      const oldest = fences.values().next().value;
      if (typeof oldest !== "string") break;
      fences.delete(oldest);
    }
    if (fences.size) this.canonicalCompletedTurnIdsByChatId.set(chatId, fences);
    const pendingInbound = this.pendingInboundByChat.get(chatId);
    if (pendingInbound) {
      const remaining = pendingInbound.filter((event) => {
        const turnId = eventTurnId(event);
        return !turnId || !fences.has(turnId);
      });
      if (remaining.length) this.pendingInboundByChat.set(chatId, remaining);
      else this.pendingInboundByChat.delete(chatId);
    }
    if (
      !this.canReconcileCanonicalCompletion(
        chatId,
        expectedRunGeneration,
        [],
        snapshot,
      )
    ) {
      return false;
    }

    const observed = new Set(snapshot?.observedTurnIds.filter(Boolean) ?? []);
    const unsettled = this.unsettledRunTurnIdsByChatId.get(chatId);
    if (unsettled) {
      for (const turnId of [...unsettled]) {
        if (
          !this.canonicalTurnWillSettle(
            chatId,
            turnId,
            fences,
            observed,
            snapshot,
          )
        )
          continue;
        unsettled.delete(turnId);
        this.completePendingMessage(chatId, turnId);
        this.runStartedAtByTurnKey.delete(this.runSendKey(chatId, turnId));
      }
      if (!unsettled.size) this.unsettledRunTurnIdsByChatId.delete(chatId);
    }
    this.settleNonLifecycleCanonicalSends(chatId, fences, observed, snapshot);
    if (this.runStartedAtByChatId.delete(chatId))
      this.emitRunStatus(chatId, null);
    return true;
  }

  private canonicalTurnWillSettle(
    chatId: string,
    turnId: string,
    completed: ReadonlySet<string>,
    observed: ReadonlySet<string>,
    snapshot?: CanonicalRunSnapshot,
  ): boolean {
    if (completed.has(turnId)) return true;
    if (
      !snapshot ||
      snapshot.activeTurnId === turnId ||
      snapshot.hasPendingToolCalls
    )
      return false;
    if (observed.has(turnId)) return true;
    const pending = this.pendingMessageSends.get(
      this.runSendKey(chatId, turnId),
    );
    return pending?.state === "unknown" || pending?.state === "accepted";
  }

  private settleNonLifecycleCanonicalSends(
    chatId: string,
    completed: ReadonlySet<string>,
    observed: ReadonlySet<string>,
    snapshot?: CanonicalRunSnapshot,
  ): void {
    for (const pending of [...this.pendingMessageSends.values()]) {
      if (pending.chatId !== chatId || pending.startsNewRun) continue;
      if (
        !this.canonicalTurnWillSettle(
          chatId,
          pending.turnId,
          completed,
          observed,
          snapshot,
        )
      )
        continue;
      this.completePendingMessage(chatId, pending.turnId);
    }
  }

  private prunePendingInboundTurn(chatId: string, turnId: string): void {
    const pending = this.pendingInboundByChat.get(chatId);
    if (!pending) return;
    const remaining = pending.filter((event) => eventTurnId(event) !== turnId);
    if (remaining.length) this.pendingInboundByChat.set(chatId, remaining);
    else this.pendingInboundByChat.delete(chatId);
  }

  private emitEvent(event: InboundEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private normalizeMaxFrameBytes(
    value: number | undefined,
  ): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      return undefined;
    return Math.floor(value);
  }

  private clearRunStatusesForReconnect(): void {
    if (!this.runStartedAtByChatId.size) return;
    const chatIds = [...this.runStartedAtByChatId.keys()];
    this.runStartedAtByChatId.clear();
    this.runStartedAtByTurnKey.clear();
    for (const chatId of chatIds) this.emitRunStatus(chatId, null);
  }

  private queueSend(frame: OutboundFrame): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.rawSend(frame);
    else this.sendQueue.push(frame);
  }

  private frameFitsTransport(frame: OutboundFrame): boolean {
    if (this.maxFrameBytes === undefined) return true;
    return (
      new TextEncoder().encode(JSON.stringify(frame)).byteLength <=
      this.maxFrameBytes
    );
  }

  private rawSend(frame: OutboundFrame): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this.sendQueue.push(frame);
      return;
    }
    try {
      socket.send(JSON.stringify(frame));
      this.lastSocketMessageSendKey = null;
      if (frame.type === "message") {
        const key = this.runSendKey(frame.chat_id, frame.turn_id);
        const pending = this.pendingMessageSends.get(key);
        if (pending) {
          pending.state = "sent";
          this.socketPendingMessageSendKeys.add(key);
          this.lastSocketMessageSendKey = key;
        }
      }
    } catch {
      this.sendQueue.push(frame);
    }
  }

  private runSendKey(chatId: string, turnId: string): string {
    return `${chatId}\u0000${turnId}`;
  }

  private advanceRunGeneration(chatId: string, turnId?: string): void {
    this.runGenerationByChatId.set(chatId, this.getRunGeneration(chatId) + 1);
    if (!turnId) {
      this.latestRunTurnIdByChatId.delete(chatId);
      return;
    }
    this.latestRunTurnIdByChatId.set(chatId, turnId);
    const unsettled =
      this.unsettledRunTurnIdsByChatId.get(chatId) ?? new Set<string>();
    unsettled.add(turnId);
    this.unsettledRunTurnIdsByChatId.set(chatId, unsettled);
  }

  private recordRunAcceptance(chatId: string, turnId: string): void {
    const key = this.runSendKey(chatId, turnId);
    const pending = this.pendingMessageSends.get(key);
    if (!pending) return;
    this.socketPendingMessageSendKeys.delete(key);
    if (!pending.acceptanceSettled) {
      pending.acceptanceSettled = true;
      pending.resolve();
    }
    if (!pending.startsNewRun) {
      this.pendingMessageSends.delete(key);
      return;
    }
    pending.state = "accepted";
  }

  private recordRunRejection(
    chatId: string,
    turnId: string,
    error: Error,
  ): void {
    const rejectedLatest = this.latestRunTurnIdByChatId.get(chatId) === turnId;
    const pending = this.pendingMessageSends.get(
      this.runSendKey(chatId, turnId),
    );
    if (pending) this.rejectPendingMessage(pending, error);
    this.runStartedAtByTurnKey.delete(this.runSendKey(chatId, turnId));
    this.prunePendingInboundTurn(chatId, turnId);
    const unsettled = this.unsettledRunTurnIdsByChatId.get(chatId);
    unsettled?.delete(turnId);
    if (unsettled && !unsettled.size)
      this.unsettledRunTurnIdsByChatId.delete(chatId);
    if (!rejectedLatest) return;
    const previousTurnId = unsettled ? [...unsettled].at(-1) : undefined;
    if (previousTurnId) {
      this.latestRunTurnIdByChatId.set(chatId, previousTurnId);
      const previousStartedAt = this.runStartedAtByTurnKey.get(
        this.runSendKey(chatId, previousTurnId),
      );
      const currentStartedAt = this.runStartedAtByChatId.get(chatId);
      if (previousStartedAt === undefined) {
        if (this.runStartedAtByChatId.delete(chatId))
          this.emitRunStatus(chatId, null);
      } else {
        this.runStartedAtByChatId.set(chatId, previousStartedAt);
        if (currentStartedAt !== previousStartedAt)
          this.emitRunStatus(chatId, previousStartedAt);
      }
      return;
    }
    this.latestRunTurnIdByChatId.delete(chatId);
    if (this.runStartedAtByChatId.delete(chatId))
      this.emitRunStatus(chatId, null);
  }

  private recordGoalStateSnapshot(chatId: string, event: InboundEvent): void {
    if (event.event === "goal_state") {
      this.goalStateByChatId.set(chatId, event.goal_state);
      return;
    }
    if (event.event === "turn_end" && event.goal_state) {
      this.goalStateByChatId.set(chatId, event.goal_state);
    }
  }

  private recordRunLifecycle(chatId: string, event: InboundEvent): void {
    if (event.event === "goal_status" && event.status === "running") {
      if (typeof event.started_at !== "number") return;
      this.advanceRunGeneration(chatId, event.turn_id);
      if (event.turn_id) {
        this.runStartedAtByTurnKey.set(
          this.runSendKey(chatId, event.turn_id),
          event.started_at,
        );
      }
      const previous = this.runStartedAtByChatId.get(chatId);
      this.runStartedAtByChatId.set(chatId, event.started_at);
      if (previous !== event.started_at)
        this.emitRunStatus(chatId, event.started_at);
      return;
    }
    if (
      event.event !== "turn_end" &&
      !(event.event === "goal_status" && event.status === "idle")
    )
      return;
    const turnId = eventTurnId(event);
    if (turnId) {
      this.completePendingMessage(chatId, turnId);
      this.runStartedAtByTurnKey.delete(this.runSendKey(chatId, turnId));
      const unsettled = this.unsettledRunTurnIdsByChatId.get(chatId);
      unsettled?.delete(turnId);
      if (unsettled && !unsettled.size)
        this.unsettledRunTurnIdsByChatId.delete(chatId);
    }
    const latest = this.latestRunTurnIdByChatId.get(chatId);
    if (
      (!latest || turnId === latest) &&
      this.runStartedAtByChatId.delete(chatId)
    ) {
      this.emitRunStatus(chatId, null);
    }
  }

  private isCanonicalCompletedTurnEvent(
    chatId: string,
    event: InboundEvent,
  ): boolean {
    const turnId = eventTurnId(event);
    return Boolean(
      turnId && this.canonicalCompletedTurnIdsByChatId.get(chatId)?.has(turnId),
    );
  }

  private isSupersededRunCompletion(
    chatId: string,
    event: InboundEvent,
  ): boolean {
    if (
      event.event !== "turn_end" &&
      !(event.event === "goal_status" && event.status === "idle")
    )
      return false;
    const turnId = eventTurnId(event);
    const latest = this.latestRunTurnIdByChatId.get(chatId);
    if (!turnId && latest) return true;
    return Boolean(turnId && latest && turnId !== latest);
  }

  private uniqueUnsettledTurnId(chatId: string): string | null {
    const unsettled = this.unsettledRunTurnIdsByChatId.get(chatId);
    if (!unsettled || unsettled.size !== 1) return null;
    return unsettled.values().next().value ?? null;
  }

  private legacyRejectionTarget(
    event: Extract<InboundEvent, { event: "error" }>,
  ): {
    chatId: string;
    turnId: string;
  } | null {
    if (!event.detail || !TURN_REJECTION_DETAILS.has(event.detail)) return null;
    if (
      event.detail === "workspace_scope_rejected" &&
      !event.chat_id &&
      this.pendingNewChat
    )
      return null;
    const candidates = [...this.pendingMessageSends.values()].filter(
      (pending) =>
        pending.state === "sent" &&
        (!event.chat_id || pending.chatId === event.chat_id),
    );
    if (candidates.length !== 1) return null;
    const [candidate] = candidates;
    if (
      this.lastSocketMessageSendKey !==
      this.runSendKey(candidate.chatId, candidate.turnId)
    ) {
      return null;
    }
    return { chatId: candidate.chatId, turnId: candidate.turnId };
  }

  private completePendingMessage(chatId: string, turnId: string): void {
    const key = this.runSendKey(chatId, turnId);
    const pending = this.pendingMessageSends.get(key);
    if (!pending) return;
    if (!pending.acceptanceSettled) {
      pending.acceptanceSettled = true;
      pending.resolve();
    }
    this.pendingMessageSends.delete(key);
    this.socketPendingMessageSendKeys.delete(key);
    this.sendQueue = this.sendQueue.filter(
      (frame) =>
        !(
          frame.type === "message" &&
          frame.chat_id === chatId &&
          frame.turn_id === turnId
        ),
    );
  }

  private rejectPendingMessage(
    pending: PendingMessageSend,
    error: Error,
  ): void {
    const key = this.runSendKey(pending.chatId, pending.turnId);
    if (!pending.acceptanceSettled) {
      pending.acceptanceSettled = true;
      pending.reject(error);
    }
    this.pendingMessageSends.delete(key);
    this.socketPendingMessageSendKeys.delete(key);
    this.sendQueue = this.sendQueue.filter(
      (frame) =>
        !(
          frame.type === "message" &&
          frame.chat_id === pending.chatId &&
          frame.turn_id === pending.turnId
        ),
    );
  }

  private resolveSystemCommand(turnId: string): void {
    const pending = this.pendingSystemCommands.get(turnId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingSystemCommands.delete(turnId);
    pending.resolve();
  }

  private rejectSystemCommand(turnId: string, error: Error): void {
    const pending = this.pendingSystemCommands.get(turnId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingSystemCommands.delete(turnId);
    pending.reject(error);
  }

  private rejectAllSystemCommands(error: Error): void {
    for (const [turnId, pending] of this.pendingSystemCommands) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingSystemCommands.delete(turnId);
    }
  }

  private resolveTranscription(requestId: string, text: string): void {
    const pending = this.pendingTranscriptions.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingTranscriptions.delete(requestId);
    pending.resolve(text);
  }

  private rejectTranscription(
    requestId?: string,
    detail?: string,
    provider?: string,
  ): void {
    const message = [detail || "transcription_failed", provider]
      .filter(Boolean)
      .join(":");
    if (!requestId) {
      this.rejectAllTranscriptions(new Error(message));
      return;
    }
    const pending = this.pendingTranscriptions.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingTranscriptions.delete(requestId);
    pending.reject(new Error(message));
  }

  private rejectAllTranscriptions(error: Error): void {
    for (const [requestId, pending] of this.pendingTranscriptions) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.removeQueuedTranscription(requestId);
    }
    this.pendingTranscriptions.clear();
  }

  private removeQueuedTranscription(requestId: string): void {
    this.sendQueue = this.sendQueue.filter(
      (frame) =>
        !(frame.type === "transcribe_audio" && frame.request_id === requestId),
    );
  }

  private handleClose(code?: number): void {
    this.socket = null;
    this.rejectAllTranscriptions(new Error("transcription_connection_closed"));
    this.rejectAllSystemCommands(
      new Error(
        i18n.t("connection.interrupted", {
          defaultValue: "The connection was interrupted. Try again.",
        }),
      ),
    );
    if (this.pendingNewChat) {
      clearTimeout(this.pendingNewChat.timer);
      this.pendingNewChat.reject(
        new Error(
          i18n.t("chat.createConnectionInterrupted", {
            defaultValue:
              "The connection was interrupted before the topic was created. Try again.",
          }),
        ),
      );
      this.pendingNewChat = null;
    }
    const unacknowledged = [...this.socketPendingMessageSendKeys]
      .map((key) => this.pendingMessageSends.get(key))
      .filter((pending): pending is PendingMessageSend => Boolean(pending));
    if (code === 1009) {
      const candidate = unacknowledged.length === 1 ? unacknowledged[0] : null;
      const candidateKey = candidate
        ? this.runSendKey(candidate.chatId, candidate.turnId)
        : null;
      if (candidate && this.lastSocketMessageSendKey === candidateKey) {
        const error = new Error(
          i18n.t("thread.composer.imageRejected.transport_too_large"),
        );
        this.recordRunRejection(candidate.chatId, candidate.turnId, error);
        this.emitTransportError({
          kind: "message_too_big",
          chatId: candidate.chatId,
          turnId: candidate.turnId,
        });
        const synthetic: InboundEvent = {
          event: "error",
          detail: "message_too_big",
          chat_id: candidate.chatId,
          turn_id: candidate.turnId,
        };
        this.emitEvent(synthetic);
      } else {
        this.emitTransportError({ kind: "message_too_big" });
      }
    }
    for (const pending of unacknowledged) {
      const current = this.pendingMessageSends.get(
        this.runSendKey(pending.chatId, pending.turnId),
      );
      if (!current) continue;
      if (current.state === "sent") current.state = "unknown";
    }
    this.socketPendingMessageSendKeys.clear();
    this.lastSocketMessageSendKey = null;
    if (this.intentionallyClosed) {
      this.setStatus("closed");
      return;
    }
    this.scheduleReconnect();
  }

  private emitRunStatus(chatId: string, startedAt: number | null): void {
    for (const listener of this.runStatusListeners) listener(chatId, startedAt);
  }

  private emitTransportError(error: NanobotTransportError): void {
    for (const listener of this.transportErrorListeners) {
      try {
        listener(error);
      } catch {
        // A UI listener must not interrupt reconnect bookkeeping.
      }
    }
  }

  private scheduleReconnect(): void {
    this.clearRunStatusesForReconnect();
    this.setStatus("reconnecting");
    const delay = Math.min(500 * 2 ** this.reconnectAttempt, 15_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        const refreshedUrl = await this.reauthenticate();
        if (refreshedUrl) this.currentUrl = refreshedUrl;
      } catch {
        // Retry the current token; the next reconnect will reauthenticate again.
      }
      this.connect();
    }, delay);
  }
}
