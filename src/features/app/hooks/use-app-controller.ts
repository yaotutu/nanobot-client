import { useCallback } from 'react';

import { useReadyDataLifecycle } from '@/features/app/hooks/use-ready-data-lifecycle';
import { useAppSessionCommands } from '@/features/app/hooks/use-app-session-commands';
import { useConnectionRecoveryLifecycle } from '@/features/app/hooks/use-connection-recovery-lifecycle';
import { useSocketLifecycle } from '@/features/app/hooks/use-socket-lifecycle';
import { selectAuthPhase, selectBootstrap, useAuthStore } from '@/features/auth/store';
import { useCapabilitiesStore } from '@/features/capabilities/store';
import { useChatCommands } from '@/features/chat/hooks/use-chat-commands';
import {
  useCanonicalRefresh,
  useThreadLifecycle,
} from '@/features/chat/hooks/use-thread-lifecycle';
import { chatIdFromKey } from '@/features/chat/model/chat-key';
import type { ChatScreenController } from '@/features/chat/model/chat-screen-contract';
import { useChatStore } from '@/features/chat/store';
import { useConnectionStore } from '@/features/connection/store';
import { selectSessions, selectSidebarState, useSidebarStore } from '@/features/sidebar/store';
import { useSkillsStore } from '@/features/skills/store';
import { useWorkspacesStore } from '@/features/workspaces/store';
import { normalizeWorkspaceScope } from '@/services/runtime/workspace-paths';
import type { SessionAutomationJob } from '@/types/api/automations';
import type { WorkspaceScopePayload } from '@/types/api/workspaces';

export function useAppController() {
  useReadyDataLifecycle();

  const phase = useAuthStore(selectAuthPhase);
  const bootstrap = useAuthStore(selectBootstrap);
  const authenticationFailed = useAuthStore((state) => state.authenticationFailed);
  const authError = useAuthStore((state) => state.error);
  const authenticate = useAuthStore((state) => state.authenticate);
  const retryConnection = useAuthStore((state) => state.retryConnection);

  const sessions = useSidebarStore(selectSessions);
  const sidebarState = useSidebarStore(selectSidebarState);
  const sessionsLoading = useSidebarStore((state) => state.loading);
  const togglePinned = useSidebarStore((state) => state.togglePinned);
  const toggleArchived = useSidebarStore((state) => state.toggleArchived);
  const toggleSidebarGroup = useSidebarStore((state) => state.toggleGroup);
  const renameSession = useSidebarStore((state) => state.renameSession);
  const renameProject = useSidebarStore((state) => state.renameProject);
  const setShowArchived = useSidebarStore((state) => state.setShowArchived);
  const getSessionAutomations = useSidebarStore((state) => state.getSessionAutomations);

  const activeKey = useChatStore((state) => state.activeKey);
  const messages = useChatStore((state) => state.messages);
  const threadLoading = useChatStore((state) => state.threadLoading);
  const loadingOlder = useChatStore((state) => state.loadingOlder);
  const hasMoreBefore = useChatStore((state) => state.hasMoreBefore);
  const userMessageOffset = useChatStore((state) => state.userMessageOffset);
  const forkBoundaryMessageCount = useChatStore((state) => state.forkBoundaryMessageCount);
  const turnActive = useChatStore((state) => state.turnActive);
  const runStartedAt = useChatStore((state) => state.runStartedAt);
  const goalState = useChatStore((state) => state.goalState);
  const turnModelName = useChatStore((state) => state.turnModelName);
  const runtimeModelName = useChatStore((state) => state.runtimeModelName);
  const modelSettingsRevision = useChatStore((state) => state.modelSettingsRevision);
  const streamError = useChatStore((state) => state.streamError);
  const draftWorkspaceScope = useChatStore((state) => state.draftWorkspaceScope);
  const chatError = useChatStore((state) => state.error);
  const workspaceOverrides = useChatStore((state) => state.workspaceOverrides);
  const clearChatError = useChatStore((state) => state.clearError);
  const setStreamError = useChatStore((state) => state.setStreamError);

  const connectionStatus = useConnectionStore((state) => state.status);
  const networkAvailable = useConnectionStore((state) => state.networkAvailable);
  const connectionSyncing = useConnectionStore((state) => state.needsCanonicalReconnect);
  const setReconnectReason = useConnectionStore((state) => state.setReconnectReason);

  const slashCommands = useCapabilitiesStore((state) => state.slashCommands);
  const cliApps = useCapabilitiesStore((state) => state.cliApps);
  const mcpPresets = useCapabilitiesStore((state) => state.mcpPresets);
  const skills = useSkillsStore((state) => state.skills);
  const workspaces = useWorkspacesStore((state) => state.workspaces);
  const workspaceError = useWorkspacesStore((state) => state.error);

  const activeSession = activeKey
    ? sessions.find((session) => session.key === activeKey) ?? null
    : null;
  const activeWorkspaceScope: WorkspaceScopePayload | null = (() => {
    const chatId = activeSession?.chatId ?? chatIdFromKey(activeKey);
    if (chatId && workspaceOverrides[chatId]) return workspaceOverrides[chatId];
    if (activeSession?.workspaceScope) return normalizeWorkspaceScope(activeSession.workspaceScope);
    return draftWorkspaceScope ?? workspaces?.default_scope ?? null;
  })();

  const refreshCanonical = useCanonicalRefresh(activeKey, Boolean(bootstrap));
  const socketRef = useSocketLifecycle(refreshCanonical);
  useConnectionRecoveryLifecycle(socketRef, Boolean(bootstrap) && phase === 'ready');
  const { loadOlder } = useThreadLifecycle({
    activeKey,
    enabled: Boolean(bootstrap),
    socketRef,
  });
  const sessionCommands = useAppSessionCommands({
    activeKey,
    activeSession,
    activeWorkspaceScope,
    authenticated: Boolean(bootstrap),
    sessions,
    sidebarTitleOverrides: sidebarState.title_overrides,
    socketRef,
    turnActive,
    workspaces,
  });
  const chatCommands = useChatCommands({
    activeKey,
    activeWorkspaceScope,
    bootstrap,
    messages,
    onChatCreated: sessionCommands.selectCreatedChat,
    sessions,
    socketRef,
  });

  const reconnectSocket = useCallback(async (): Promise<void> => {
    setReconnectReason('manual');
    await socketRef.current?.reconnectNow();
  }, [setReconnectReason, socketRef]);
  const selectSession = useCallback((key: string | null) => {
    useChatStore.getState().selectSession(key, useSidebarStore.getState().sessions);
  }, []);
  const dismissStreamError = useCallback(() => setStreamError(null), [setStreamError]);
  const getSessionAutomationsTyped = useCallback(async (
    key: string,
  ): Promise<SessionAutomationJob[]> => {
    const result = await getSessionAutomations(key);
    return result as SessionAutomationJob[];
  }, [getSessionAutomations]);

  const currentError = authError ?? chatError;
  const chat: ChatScreenController | null = bootstrap ? {
    session: { activeKey, activeSession, sidebarState },
    capabilities: { bootstrap, cliApps, mcpPresets, skills, slashCommands },
    thread: {
      messages,
      loading: threadLoading,
      loadingOlder,
      hasMoreBefore,
      userMessageOffset,
      forkBoundaryMessageCount,
      loadOlder,
      retryFromMessage: chatCommands.retryFromMessage,
      forkFromMessage: sessionCommands.forkFromMessage,
    },
    runtime: {
      connectionStatus,
      connectionSyncing,
      networkAvailable,
      reconnect: reconnectSocket,
      turnActive,
      runStartedAt,
      goalState,
      sendMessage: chatCommands.sendMessage,
      stopTurn: chatCommands.stopTurn,
      transcribeAudio: chatCommands.transcribeAudio,
    },
    workspace: {
      activeScope: activeWorkspaceScope,
      catalog: workspaces,
      error: workspaceError,
      updateScope: sessionCommands.updateWorkspaceScope,
    },
    errors: {
      current: currentError,
      stream: streamError,
      clear: clearChatError,
      dismissStream: dismissStreamError,
    },
    automations: { getForSession: getSessionAutomationsTyped },
  } : null;

  return {
    auth: {
      phase,
      bootstrap,
      authenticationFailed,
      error: currentError,
      authenticate,
      retryConnection,
    },
    chat,
    model: {
      activeSession,
      runtimeModelName,
      turnModelName,
      modelSettingsRevision,
      changeModelPreset: chatCommands.changeModelPreset,
    },
    connection: {
      status: connectionStatus,
      networkAvailable,
      reconnect: reconnectSocket,
    },
    sidebar: {
      sessions,
      state: sidebarState,
      loading: sessionsLoading,
      selectSession,
      togglePinned,
      toggleArchived,
      toggleGroup: toggleSidebarGroup,
      renameSession,
      renameProject,
      setShowArchived,
      getSessionAutomations: getSessionAutomationsTyped,
      removeSession: sessionCommands.removeSession,
    },
    workspace: {
      catalog: workspaces,
      startNewChat: sessionCommands.startNewChat,
      startNewChatInProject: sessionCommands.startNewChatInProject,
    },
    runtime: {
      logout: sessionCommands.logout,
      restartServer: chatCommands.restartServer,
    },
  };
}

export type AppController = ReturnType<typeof useAppController>;
