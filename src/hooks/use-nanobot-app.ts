import { debugLog } from '@/services/runtime/debug-log';
import { normalizeWorkspaceScope } from '@/services/runtime/workspace-paths';

import { useAuthBootstrapLifecycle } from '@/features/app/hooks/use-auth-bootstrap-lifecycle';
import { useAuthStore, selectAuthPhase, selectBootstrap } from '@/features/auth/store';
import { useCapabilitiesStore } from '@/features/capabilities/store';
import { useChatCommands } from '@/features/chat/hooks/use-chat-commands';
import { useSessionCommands } from '@/features/chat/hooks/use-session-commands';
import {
  useCanonicalRefresh,
  useThreadLifecycle,
} from '@/features/chat/hooks/use-thread-lifecycle';
import { chatIdFromKey } from '@/features/chat/model/chat-key';
import { useChatStore } from '@/features/chat/store';
import { useConnectionStore } from '@/features/connection/store';
import { useSocketLifecycle } from '@/features/connection/use-socket-lifecycle';
import {
  useSidebarStore,
  selectSessions,
  selectSidebarState,
} from '@/features/sidebar/store';
import { useWorkspacesStore } from '@/features/workspaces/store';

import type { SessionAutomationJob } from '@/types/api/automations';
import type { WorkspaceScopePayload } from '@/types/api/workspaces';

export function useNanobotApp() {
  debugLog('HOOK', 'useNanobotApp enter (composed facade)');
  useAuthBootstrapLifecycle();

  const phase = useAuthStore(selectAuthPhase);
  const bootstrap = useAuthStore(selectBootstrap);
  const authenticationFailed = useAuthStore((state) => state.authenticationFailed);
  const authError = useAuthStore((state) => state.error);
  const authenticate = useAuthStore((state) => state.authenticate);
  const retryConnection = useAuthStore((state) => state.retryConnection);

  const sessions = useSidebarStore(selectSessions);
  const sidebarState = useSidebarStore(selectSidebarState);
  const sessionsLoading = useSidebarStore((state) => state.loading);
  const refreshSessions = useSidebarStore((state) => state.refresh);
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

  const slashCommands = useCapabilitiesStore((state) => state.slashCommands);
  const cliApps = useCapabilitiesStore((state) => state.cliApps);
  const mcpPresets = useCapabilitiesStore((state) => state.mcpPresets);
  const skills = useCapabilitiesStore((state) => state.skills);

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
  const { loadOlder } = useThreadLifecycle({
    activeKey,
    enabled: Boolean(bootstrap),
    socketRef,
  });
  const chatCommands = useChatCommands({
    activeKey,
    activeWorkspaceScope,
    bootstrap,
    messages,
    sessions,
    socketRef,
  });
  const sessionCommands = useSessionCommands({
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
    authenticate,
    retryConnection,
    refreshSessions,
    selectSession: (key: string | null) => {
      useChatStore.getState().selectSession(key, useSidebarStore.getState().sessions);
    },
    loadOlder,
    ...chatCommands,
    ...sessionCommands,
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
  };
}
