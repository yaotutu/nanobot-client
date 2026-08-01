import { useCallback, useEffect, useMemo, useRef } from 'react';
import i18n from '@/i18n';
import { debugLog } from '@/services/runtime/debug-log';

import { useAuthStore, selectAuthPhase, selectBootstrap } from '@/features/auth/store';
import { useChatStore } from '@/features/chat/store';
import { useConnectionStore } from '@/features/connection/store';
import { useSidebarStore, selectSessions, selectSidebarState } from '@/features/sidebar/store';
import { useCapabilitiesStore } from '@/features/capabilities/store';
import { useSettingsStore } from '@/features/settings/store';
import { useWorkspacesStore } from '@/features/workspaces/store';

import type {
  SessionAutomationJob,
  SessionDeleteResult,

  SendAttachment,
  SettingsPayload,
  SendMessageOptions,

  UIMessage,

  WorkspaceScopePayload,

} from '@/types/api';

import { fetchThread } from '@/features/chat/api';
import { listSlashCommands } from '@/features/capabilities/api';
import { fetchSettings } from '@/features/settings/api';
import { fetchWorkspaces } from '@/features/workspaces/api';
import { createNanobotSocket, type NanobotSocket, type MessageSendResult as SendMessageResult } from "@/features/connection/socket-transport";
import { deriveWsUrl } from "@/services/api/bootstrap";
import { DEFAULT_SERVER_URL as SERVER_URL } from "@/services/api/config";

import { resolveRuntimeClientPolicy, mergeRuntimeMetadata } from '@/services/runtime/runtime-capabilities';
import { sessionTitle } from '@/services/text/format';
import { normalizeWorkspaceScope, projectNameFromPath } from '@/services/runtime/workspace-paths';
import { formatQuotedUserMessage, normalizeQuotedContext } from '@/services/text/user-quote-format';
import { hasPendingAgentActivity } from '@/features/chat/activity-timeline';

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateOutboundMessage(
  bootstrap: { limits?: { message: { max_text_bytes: number }; attachments: { max_count: number }; transport: { max_frame_bytes: number } } | null },
  chatId: string,
  content: string,
  attachments: SendAttachment[],
  options: SendMessageOptions,
): void {
  const limits = bootstrap?.limits;
  if (!limits) return;
  if (utf8Bytes(content) > limits.message.max_text_bytes) {
    throw new Error(
      i18n.t('thread.composer.textTooLarge', {
        max: limits.message.max_text_bytes,
      }),
    );
  }
  if (attachments.length > limits.attachments.max_count) {
    throw new Error(
      i18n.t('thread.composer.imageRejected.too_many_attachments', {
        max: limits.attachments.max_count,
      }),
    );
  }
  const projectedFrame = JSON.stringify({
    type: 'message',
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
    turn_id: '00000000-0000-4000-8000-000000000000',
    webui: true,
  });
  if (utf8Bytes(projectedFrame) > limits.transport.max_frame_bytes) {
    throw new Error(i18n.t('thread.composer.imageRejected.transport_too_large'));
  }
}

function chatIdFromKey(key: string | null): string | null {
  if (!key) return null;
  const sep = key.indexOf(':');
  return sep < 0 ? key : key.slice(sep + 1);
}

function optimisticUserMessage(
  content: string,
  turnId: string,
  attachments: SendAttachment[],
  options: SendMessageOptions,
): UIMessage {
  return {
    id: `user-${turnId}`,
    role: 'user',
    content,
    createdAt: Date.now(),
    turnId,
    turnPhase: 'user',
    ...(attachments.length
      ? { media: attachments.map((item) => item.preview) }
      : {}),
    ...(options.cliApps?.length ? { cliApps: options.cliApps } : {}),
    ...(options.mcpPresets?.length ? { mcpPresets: options.mcpPresets } : {}),
  };
}

export function useNanobotApp() {
  debugLog('HOOK', 'useNanobotApp enter (store-backed)');

  // ---- store reads (high-level, narrow selectors) ----
  const phase = useAuthStore(selectAuthPhase);
  const bootstrap = useAuthStore(selectBootstrap);
  const authenticationFailed = useAuthStore((s) => s.authenticationFailed);
  const authError = useAuthStore((s) => s.error);
  const authenticate = useAuthStore((s) => s.authenticate);
  const retryConnection = useAuthStore((s) => s.retryConnection);
  const refreshAuth = useAuthStore((s) => s.refreshBootstrap);
  const logout = useAuthStore((s) => s.logout);

  const sessions = useSidebarStore(selectSessions);
  const sidebarState = useSidebarStore(selectSidebarState);
  const sessionsLoading = useSidebarStore((s) => s.loading);
  const refreshSessions = useSidebarStore((s) => s.refresh);
  const togglePinned = useSidebarStore((s) => s.togglePinned);
  const toggleArchived = useSidebarStore((s) => s.toggleArchived);
  const toggleSidebarGroup = useSidebarStore((s) => s.toggleGroup);
  const renameSession = useSidebarStore((s) => s.renameSession);
  const renameProject = useSidebarStore((s) => s.renameProject);
  const setShowArchived = useSidebarStore((s) => s.setShowArchived);
  const removeSession = useSidebarStore((s) => s.removeSession);
  const getSessionAutomations = useSidebarStore((s) => s.getSessionAutomations);
  const refreshSidebarState = useSidebarStore((s) => s.refreshSidebarState);
  const sidebarTitleOverrides = sidebarState.title_overrides;

  const activeKey = useChatStore((s) => s.activeKey);
  const messages = useChatStore((s) => s.messages);
  const threadLoading = useChatStore((s) => s.threadLoading);
  const loadingOlder = useChatStore((s) => s.loadingOlder);
  const hasMoreBefore = useChatStore((s) => s.hasMoreBefore);
  const userMessageOffset = useChatStore((s) => s.userMessageOffset);
  const forkBoundaryMessageCount = useChatStore((s) => s.forkBoundaryMessageCount);
  const turnActive = useChatStore((s) => s.turnActive);
  const runStartedAt = useChatStore((s) => s.runStartedAt);
  const goalState = useChatStore((s) => s.goalState);
  const turnModelName = useChatStore((s) => s.turnModelName);
  const runtimeModelName = useChatStore((s) => s.runtimeModelName);
  const modelSettingsRevision = useChatStore((s) => s.modelSettingsRevision);
  const streamError = useChatStore((s) => s.streamError);
  const draftWorkspaceScope = useChatStore((s) => s.draftWorkspaceScope);
  const chatError = useChatStore((s) => s.error);
  const chatWorkspacesOverrides = useChatStore((s) => s.workspaceOverrides);
  const selectSession = useChatStore((s) => s.selectSession);
  const applyCanonicalHistory = useChatStore((s) => s.applyCanonicalHistory);
  const applyInboundEvent = useChatStore((s) => s.applyInboundEvent);
  const prependOlder = useChatStore((s) => s.prependOlder);
  const setBeforeCursor = useChatStore((s) => s.setBeforeCursor);
  const setUserMessageOffset = useChatStore((s) => s.setUserMessageOffset);
  const setForkBoundaryMessageCount = useChatStore((s) => s.setForkBoundaryMessageCount);
  const setTurnActive = useChatStore((s) => s.setTurnActive);
  const setRunStartedAtAction = useChatStore((s) => s.setRunStartedAt);
  const setThreadLoading = useChatStore((s) => s.setThreadLoading);
  const setLoadingOlder = useChatStore((s) => s.setLoadingOlder);
  const setRuntimeModelName = useChatStore((s) => s.setRuntimeModelName);
  const setWorkspaceOverride = useChatStore((s) => s.setWorkspaceOverride);
  const setDraftWorkspaceScope = useChatStore((s) => s.setDraftWorkspaceScope);
  const setChatError = useChatStore((s) => s.setError);
  const clearChatError = useChatStore((s) => s.clearError);
  const setStreamError = useChatStore((s) => s.setStreamError);
  const applyRunStatus = useChatStore((s) => s.applyRunStatus);
  const markSideChannel = useChatStore((s) => s.markSideChannel);
  const prepareUserTurn = useChatStore((s) => s.prepareUserTurn);
  const resetAllChat = useChatStore((s) => s.resetAll);

  const connectionStatus = useConnectionStore((s) => s.status);
  const hasOpenedSocket = useConnectionStore((s) => s.hasOpenedSocket);
  const needsCanonicalReconnect = useConnectionStore((s) => s.needsCanonicalReconnect);
  const markOpened = useConnectionStore((s) => s.markOpened);
  const markReconnectNeeded = useConnectionStore((s) => s.markReconnectNeeded);
  const clearReconnectNeeded = useConnectionStore((s) => s.clearReconnectNeeded);
  const setConnectionStatus = useConnectionStore((s) => s.setStatus);

  const slashCommands = useCapabilitiesStore((s) => s.slashCommands);
  const cliApps = useCapabilitiesStore((s) => s.cliApps);
  const mcpPresets = useCapabilitiesStore((s) => s.mcpPresets);
  const skills = useCapabilitiesStore((s) => s.skills);
  const refreshCapabilities = useCapabilitiesStore((s) => s.refreshAll);
  const applyCliAppsPayload = useCapabilitiesStore((s) => s.applyCliAppsPayload);
  const applyMcpPresetsPayload = useCapabilitiesStore((s) => s.applyMcpPresetsPayload);
  const resetCapabilities = useCapabilitiesStore((s) => s.resetAll);

  const settings = useSettingsStore((s) => s.settings);
  const refreshSettingsAction = useSettingsStore((s) => s.refresh);

  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const refreshWorkspacesAction = useWorkspacesStore((s) => s.refresh);

  // ---- 派生 ----
  const activeSession = activeKey ? sessions.find((s) => s.key === activeKey) ?? null : null;
  const activeWorkspaceScope: WorkspaceScopePayload | null = (() => {
    const chatId = activeSession?.chatId ?? chatIdFromKey(activeKey);
    if (chatId && chatWorkspacesOverrides[chatId]) return chatWorkspacesOverrides[chatId];
    if (activeSession?.workspaceScope) return normalizeWorkspaceScope(activeSession.workspaceScope);
    return draftWorkspaceScope ?? workspaces?.default_scope ?? null;
  })();

  // ---- socket 生命周期 ----
  const socketRef = useRef<NanobotSocket | null>(null);
  const apiTokenRef = useRef<string | null>(null);

  // 同步 apiToken
   
  useEffect(() => {
    apiTokenRef.current = useAuthStore.getState().apiToken;
  });

  // ---- 一次性 bootstrap 从 storage ----
  useEffect(() => {
    void useAuthStore.getState().bootstrapFromStorage();
  }, []);

  // ---- refresh canonical ----
  const refreshCanonical = useCallback(async () => {
    if (!activeKey || !bootstrap) return;
    const requestKey = activeKey;
    try {
      const thread = await fetchThread(requestKey, { limit: 160, direction: 'latest' });
      if (!thread) return;
      const hasPending = thread.active_turn_id
        ? true
        : (typeof thread.has_pending_tool_calls === 'boolean'
            ? thread.has_pending_tool_calls
            : hasPendingAgentActivity(thread.messages));
      if (hasPending) {
        setTurnActive(true);
        return;
      }
      applyCanonicalHistory(thread.messages, {
        beforeCursor: thread.page?.before_cursor ?? null,
        hasMoreBefore: Boolean(thread.page?.has_more_before),
        userMessageOffset: Math.max(0, thread.page?.user_message_offset ?? 0),
        forkBoundaryMessageCount:
          typeof thread.fork_boundary_message_count === 'number'
            ? thread.fork_boundary_message_count
            : null,
        activeTurnId: thread.active_turn_id ?? null,
      });
      clearReconnectNeeded();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : i18n.t('chat.resyncFailed');
      setChatError(message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, bootstrap]);

  // ---- 当 bootstrap 拿到 token 后挂载 socket ----
  useEffect(() => {
     
    if (!bootstrap || phase !== 'ready') return;
    const token = bootstrap.token;
    const wsPath = bootstrap.ws_path;
    const wsUrl = bootstrap.ws_url ?? null;
    const baseUrl = (typeof window !== 'undefined' && (window as { __NANOBOT_BASE_URL__?: string }).__NANOBOT_BASE_URL__) || '';
    void baseUrl; // baseUrl 由 socket 内部从 default 配置派生
    const derivedUrl = deriveWsUrl(SERVER_URL, wsPath, token, wsUrl);
    const socket = createNanobotSocket({
      url: derivedUrl,
      reauthenticate: async () => {
        try {
          await refreshAuth();
          const fresh = useAuthStore.getState().bootstrap;
          if (!fresh) return null;
          return deriveWsUrl(SERVER_URL, fresh.ws_path, fresh.token, fresh.ws_url ?? null);
        } catch {
          return null;
        }
      },
      maxFrameBytes: bootstrap.limits?.transport.max_frame_bytes,
    });
    socketRef.current = socket;

     
    const offStatus = socket.onStatus((status) => {
      setConnectionStatus(status);
      if (status === 'open') {
        markOpened();
        if (needsCanonicalReconnect) {
          markReconnectNeeded();
          void refreshCanonical();
        }
      } else if (status === 'reconnecting' || status === 'error' || status === 'closed') {
        if (hasOpenedSocket) markReconnectNeeded();
      }
    });

    const offRunStatus = socket.onRunStatus((chatId, startedAt) => {
      applyRunStatus(chatId, startedAt);
    });

    const offTransportError = socket.onTransportError((err) => {
      if (err.kind === 'workspace_scope_rejected') {
        setChatError(i18n.t('errors.workspaceScopeRejected.body'));
        void refreshWorkspacesAction();
      }
      setStreamError(err);
    });

    const offEvent = socket.onEvent((event) => {
      applyInboundEvent(event);
    });

    return () => {
      offStatus();
      offRunStatus();
      offTransportError();
      offEvent();
      socket.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.token, phase]);

  // ---- 切换会话：自动加载 thread ----
  useEffect(() => {
    if (!activeKey || !bootstrap) return;
    setThreadLoading(true);
    const chatId = chatIdFromKey(activeKey);
    const requestKey = activeKey;
    socketRef.current?.attach(chatId ?? '');
    void fetchThread(requestKey, { limit: 160, direction: 'latest' })
      .then((thread) => {
        if (!thread || requestKey !== activeKey) return;
        const threadActive = Boolean(
          thread.active_turn_id ||
            (typeof thread.has_pending_tool_calls === 'boolean'
              ? thread.has_pending_tool_calls
              : hasPendingAgentActivity(thread.messages)),
        );
        applyCanonicalHistory(thread.messages, {
          beforeCursor: thread.page?.before_cursor ?? null,
          hasMoreBefore: Boolean(thread.page?.has_more_before),
          userMessageOffset: Math.max(0, thread.page?.user_message_offset ?? 0),
          forkBoundaryMessageCount:
            typeof thread.fork_boundary_message_count === 'number'
              ? thread.fork_boundary_message_count
              : null,
          activeTurnId: thread.active_turn_id ?? null,
        });
        setTurnActive(threadActive);
        if (!threadActive) setRunStartedAtAction(null);
      })
      .catch((caught) => {
        const message = caught instanceof Error ? caught.message : i18n.t('chat.loadThreadFailed');
        setChatError(message);
      })
      .finally(() => {
        if (requestKey === activeKey) setThreadLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, bootstrap?.api_token]);

  // ---- bootstrap 后刷新各 store ----
  useEffect(() => {
    if (phase !== 'ready' || !bootstrap) return;
    void refreshSessions();
    void refreshSidebarState();
    void refreshCapabilities();
    void refreshSettingsAction();
    void refreshWorkspacesAction();
    void listSlashCommands().catch(() => undefined);
    void fetchSettings.bind(null); // no-op
    void fetchWorkspaces.bind(null); // no-op
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bootstrap?.token]);

  // ---- bootstrap 续期 timer ----
  useEffect(() => {
     
    if (!bootstrap || phase !== 'ready') return;
    const expiresIn = bootstrap.expires_in;
    const refreshAfterMs = Math.max(30_000, expiresIn * 1000 - 60_000);
    const timer = setTimeout(() => {
      void refreshAuth().catch(() => undefined);
    }, refreshAfterMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.expires_in, phase]);

  // ---- 续期到时把新 ws url 推给 socket ----
  useEffect(() => {
    if (!bootstrap) return;
    const url = deriveWsUrl(SERVER_URL, bootstrap.ws_path, bootstrap.token, bootstrap.ws_url ?? null);
    socketRef.current?.updateUrl(url);
    socketRef.current?.updateMaxFrameBytes(bootstrap.limits?.transport.max_frame_bytes);
    setRuntimeModelName(bootstrap.model_name?.trim() || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.expires_in]);

  // ---- refresh canonical ----

  // ---- actions for component ----
  const loadOlder = useCallback(async () => {
    if (!activeKey || !bootstrap || loadingOlder) return;
    const requestKey = activeKey;
    setLoadingOlder(true);
    try {
      const thread = await fetchThread(requestKey, {
        limit: 120,
        before: useChatStore.getState().beforeCursor ?? '',
      });
      if (!thread) return;
      prependOlder(thread.messages);
      setBeforeCursor(thread.page?.before_cursor ?? null, Boolean(thread.page?.has_more_before));
      setUserMessageOffset(Math.max(0, thread.page?.user_message_offset ?? 0));
      const boundary =
        typeof thread.fork_boundary_message_count === 'number'
          ? thread.fork_boundary_message_count
          : null;
      setForkBoundaryMessageCount(boundary);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : i18n.t('thread.loadEarlierFailed');
      setChatError(message);
    } finally {
      if (requestKey === activeKey) setLoadingOlder(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, bootstrap, loadingOlder]);

  const sendMessage = useCallback(
    async (rawContent: string, attachments: SendAttachment[] = [], options: SendMessageOptions = {}) => {
      if (!bootstrap) return;
      const content = rawContent.trim();
      const quotedContext = normalizeQuotedContext(options.quotedContext);
      const normalizedOptions: SendMessageOptions = quotedContext
        ? { ...options, quotedContext }
        : { ...options, quotedContext: undefined };
      const outboundContent = quotedContext ? formatQuotedUserMessage(content, quotedContext) : content;
      const socket = socketRef.current;
      if ((!outboundContent && attachments.length === 0) || !socket) return;

      const sideChannel = normalizedOptions.sideChannel === true;
      const continueActiveTurn = normalizedOptions.continueActiveTurn === true;
      const workspaceScope = normalizedOptions.workspaceScope
        ? normalizeWorkspaceScope(normalizedOptions.workspaceScope)
        : activeWorkspaceScope
          ? normalizeWorkspaceScope(activeWorkspaceScope)
          : null;

      let chatId = chatIdFromKey(activeKey) ?? '';
      if (!chatId) {
        try {
          chatId = await socket.newChat(5000, workspaceScope);
          const newKey = `websocket:${chatId}`;
          const now = new Date().toISOString();
          useSidebarStore.getState().addOptimistic({
            key: newKey,
            channel: 'websocket',
            chatId,
            createdAt: now,
            updatedAt: now,
            title: '',
            preview: '',
            workspaceScope,
          });
          selectSession(newKey, useSidebarStore.getState().sessions);
          if (workspaceScope) setWorkspaceOverride(chatId, workspaceScope);
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : i18n.t('chat.createFailed');
          setChatError(message);
          throw caught;
        }
      }

      validateOutboundMessage(bootstrap, chatId, outboundContent, attachments, {
        ...normalizedOptions,
        workspaceScope,
      });

      const send: SendMessageResult = socket.sendMessage(
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

      if (sideChannel) markSideChannel(send.turnId);

      useChatStore.setState((s) => ({
        messages: [
          ...s.messages,
          optimisticUserMessage(outboundContent, send.turnId, attachments, normalizedOptions),
        ],
      }));
      if (!sideChannel) setTurnActive(true);
      prepareUserTurn(send.turnId);

      try {
        await send.accepted;
      } catch (caught) {
        useChatStore.setState((s) => ({
          messages: s.messages.filter((m) => m.turnId !== send.turnId),
        }));
        if (!sideChannel && !continueActiveTurn) {
          setTurnActive(false);
          setRunStartedAtAction(null);
        }
        const message = caught instanceof Error ? caught.message : i18n.t('thread.sendFailed');
        setChatError(message);
        throw caught;
      }
    },
    [bootstrap, activeKey, activeWorkspaceScope, selectSession, markSideChannel, prepareUserTurn, setTurnActive, setRunStartedAtAction, setChatError, setWorkspaceOverride],
  );

  const stopTurn = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !activeKey) return;
    const chatId = chatIdFromKey(activeKey);
    if (!chatId) return;
    try {
      socket.stopTurn(chatId);
    } catch {
      /* ignore */
    }
    setTurnActive(false);
    setRunStartedAtAction(null);
  }, [activeKey, setTurnActive, setRunStartedAtAction]);

  const changeModelPreset = useCallback(
    async (name: string): Promise<void> => {
      const socket = socketRef.current;
      const chatId = chatIdFromKey(activeKey);
      if (!socket || !chatId) return;
      await socket.sendSystemCommand(chatId, `/model ${name}`);
    },
    [activeKey],
  );

  const transcribeAudio = useCallback(
    async (dataUrl: string, _options?: { durationMs?: number }) => {
      const socket = socketRef.current;
      if (!socket) throw new Error(i18n.t('connection.closed'));
      return socket.transcribeAudio(dataUrl, { durationMs: _options?.durationMs });
    },
    [],
  );

  const restartServer = useCallback(() => {
    const policy = resolveRuntimeClientPolicy(bootstrap);
    if (!policy.canRestart) {
      setChatError(
        policy.restartUnavailableReason ??
          i18n.t('app.system.restartUnavailable', { defaultValue: 'This client cannot restart nanobot' }),
      );
      return;
    }
    const socket = socketRef.current;
    const chatId = chatIdFromKey(activeKey) ?? sessions[0]?.chatId ?? '';
    if (!socket || !chatId) {
      setChatError(i18n.t('app.system.restartNeedsTopic', { defaultValue: 'No topic is available to restart nanobot' }));
      return;
    }
    const restart = socket.sendMessage(chatId, '/restart', undefined, { startsNewRun: false });
    markSideChannel(restart.turnId);
    void restart.accepted.catch(() => {
      setChatError(i18n.t('app.system.restartFailed', { defaultValue: 'Could not restart nanobot' }));
    });
  }, [bootstrap, activeKey, sessions, markSideChannel, setChatError]);

  const startNewChat = useCallback(() => {
    selectSession(null, []);
    setDraftWorkspaceScope(null);
  }, [selectSession, setDraftWorkspaceScope]);

  const startNewChatInProject = useCallback(
    (projectPath: string, projectName: string) => {
      const base = workspaces?.default_scope ?? activeWorkspaceScope;
      const path = projectPath.trim();
      if (!base || !path) {
        startNewChat();
        return;
      }
      selectSession(null, []);
      setDraftWorkspaceScope(
        normalizeWorkspaceScope({
          project_path: path,
          project_name: projectName.trim() || projectNameFromPath(path),
          access_mode: base.access_mode,
          restrict_to_workspace: base.access_mode === 'restricted',
        }),
      );
    },
    [workspaces?.default_scope, activeWorkspaceScope, selectSession, setDraftWorkspaceScope, startNewChat],
  );

  const updateWorkspaceScope = useCallback(
    (scope: WorkspaceScopePayload) => {
      const nextScope = normalizeWorkspaceScope(scope);
      const chatId = activeSession?.chatId ?? chatIdFromKey(activeKey);
      if (chatId && !turnActive) {
        socketRef.current?.setWorkspaceScope(chatId, nextScope);
        return;
      }
      setDraftWorkspaceScope(nextScope);
    },
    [activeSession?.chatId, activeKey, turnActive, setDraftWorkspaceScope],
  );

  const forkFromMessage = useCallback(
    async (beforeUserIndex: number) => {
      const socket = socketRef.current;
      const chatId = chatIdFromKey(activeKey);
      if (!socket || !chatId) {
        throw new Error(i18n.t('chat.notConnected'));
      }
      const sourceSession = sessions.find((s) => s.key === activeKey);
      const sourceTitle = sourceSession
        ? sidebarTitleOverrides[activeKey!] || sessionTitle(sourceSession)
        : i18n.t('chat.newChat');
      const title = i18n.t('chat.forkTitle', { title: sourceTitle });
      const forkedChatId = await socket.forkChat(chatId, beforeUserIndex, title);
      const forkedKey = `websocket:${forkedChatId}`;
      const now = new Date().toISOString();
      useSidebarStore.getState().addOptimistic({
        key: forkedKey,
        channel: 'websocket',
        chatId: forkedChatId,
        createdAt: now,
        updatedAt: now,
        title,
        preview: '',
        workspaceScope: null,
      });
      selectSession(forkedKey, useSidebarStore.getState().sessions);
      void refreshSessions();
      return forkedChatId;
    },
    [activeKey, sessions, sidebarTitleOverrides, selectSession, refreshSessions],
  );

  const retryFromMessage = useCallback(
    async (messageId: string) => {
      const socket = socketRef.current;
      const chatId = chatIdFromKey(activeKey);
      if (!socket || !chatId) return;
      const message = messages.find((m) => m.id === messageId);
      const content = message?.content ?? '';
      await sendMessage(content, [], { continueActiveTurn: false });
    },
    [activeKey, messages, sendMessage],
  );

  const removeSessionFn = useCallback(
    async (key: string, options?: { deleteAutomations?: boolean }) => {
      if (!bootstrap) return { deleted: false } as SessionDeleteResult;
      const result = await removeSession(key, options);
      if (result.deleted && activeKey === key) {
        selectSession(null, useSidebarStore.getState().sessions);
      }
      return result;
    },
    [bootstrap, activeKey, selectSession, removeSession],
  );

  // ---- cleanup on logout ----
  const logoutFn = useCallback(async () => {
    socketRef.current?.close();
    resetAllChat();
    resetCapabilities();
    void useSidebarStore.getState().resetAll();
    void useWorkspacesStore.getState().resetAll();
    void useSettingsStore.getState().resetAll();
    await logout();
  }, [logout, resetAllChat, resetCapabilities]);

  const settingsWithRuntime = useMemo<SettingsPayload | null>(() => {
    if (!settings) return null;
    return mergeRuntimeMetadata(settings, bootstrap);
  }, [settings, bootstrap]);

  return {
    phase,
    bootstrap,
    authenticationFailed,
    error: authError ?? chatError,
    streamError,
    clearError: clearChatError,
    dismissStreamError: () => setStreamError(null),
    connectionStatus,
    sessions,
    sidebarState,
    sessionsLoading,
    activeKey,
    activeSession,
    activeWorkspaceScope,
    workspaces,
    workspaceError: null,
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
    settings: settingsWithRuntime,
    applyCliAppsPayload,
    applyMcpPresetsPayload,
    authenticate,
    retryConnection,
    refreshSessions,
    selectSession: (key: string | null) => selectSession(key, useSidebarStore.getState().sessions),
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
    togglePinned: (key: string) => togglePinned(key),
    toggleArchived: (key: string) => toggleArchived(key),
    toggleSidebarGroup: (groupId: string) => toggleSidebarGroup(groupId),
    renameSession: (key: string, title: string) => renameSession(key, title),
    renameProject: (projectKey: string, title: string) => renameProject(projectKey, title),
    setShowArchived: (show: boolean) => setShowArchived(show),
    getSessionAutomations: async (key: string): Promise<SessionAutomationJob[]> => {
      const result = await getSessionAutomations(key);
      return result as SessionAutomationJob[];
    },
    removeSession: removeSessionFn,
    logout: logoutFn,
  };
}
