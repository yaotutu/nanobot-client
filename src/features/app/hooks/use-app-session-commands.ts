import { useCallback, type RefObject } from 'react';

import { useAuthStore } from '@/features/auth/store';
import { useCapabilitiesStore } from '@/features/capabilities/store';
import { useChatStore } from '@/features/chat/store';
import type { NanobotSocket } from '@/features/connection';
import { useSidebarStore } from '@/features/sidebar/store';
import { useSkillsStore } from '@/features/skills/store';
import { useWorkspacesStore } from '@/features/workspaces/store';
import i18n from '@/i18n';
import {
  normalizeWorkspaceScope,
  projectNameFromPath,
} from '@/services/runtime/workspace-paths';
import { sessionTitle } from '@/services/text/format';
import type { SessionDeleteResult } from '@/types/api/chat';
import type { ChatSummary } from '@/types/api/sidebar';
import type {
  WorkspaceScopePayload,
  WorkspacesPayload,
} from '@/types/api/workspaces';

import { chatIdFromKey } from '@/features/chat/model/chat-key';

export function useAppSessionCommands({
  activeKey,
  activeSession,
  activeWorkspaceScope,
  authenticated,
  sessions,
  sidebarTitleOverrides,
  socketRef,
  turnActive,
  workspaces,
}: {
  activeKey: string | null;
  activeSession: ChatSummary | null;
  activeWorkspaceScope: WorkspaceScopePayload | null;
  authenticated: boolean;
  sessions: ChatSummary[];
  sidebarTitleOverrides: Record<string, string>;
  socketRef: RefObject<NanobotSocket | null>;
  turnActive: boolean;
  workspaces: WorkspacesPayload | null;
}) {
  const startNewChat = useCallback(() => {
    useChatStore.getState().selectSession(null, []);
    useChatStore.getState().setDraftWorkspaceScope(null);
  }, []);

  const selectCreatedChat = useCallback((
    chatId: string,
    workspaceScope: WorkspaceScopePayload | null,
  ) => {
    const key = `websocket:${chatId}`;
    const now = new Date().toISOString();
    useSidebarStore.getState().addOptimistic({
      key,
      channel: 'websocket',
      chatId,
      createdAt: now,
      updatedAt: now,
      title: '',
      preview: '',
      workspaceScope,
    });
    useChatStore.getState().selectSession(key, useSidebarStore.getState().sessions);
    if (workspaceScope) useChatStore.getState().setWorkspaceOverride(chatId, workspaceScope);
  }, []);

  const startNewChatInProject = useCallback((projectPath: string, projectName: string) => {
    const base = workspaces?.default_scope ?? activeWorkspaceScope;
    const path = projectPath.trim();
    if (!base || !path) {
      startNewChat();
      return;
    }
    useChatStore.getState().selectSession(null, []);
    useChatStore.getState().setDraftWorkspaceScope(
      normalizeWorkspaceScope({
        project_path: path,
        project_name: projectName.trim() || projectNameFromPath(path),
        access_mode: base.access_mode,
        restrict_to_workspace: base.access_mode === 'restricted',
      }),
    );
  }, [activeWorkspaceScope, startNewChat, workspaces?.default_scope]);

  const updateWorkspaceScope = useCallback((scope: WorkspaceScopePayload) => {
    const nextScope = normalizeWorkspaceScope(scope);
    const chatId = activeSession?.chatId ?? chatIdFromKey(activeKey);
    if (chatId && !turnActive) {
      socketRef.current?.setWorkspaceScope(chatId, nextScope);
      return;
    }
    useChatStore.getState().setDraftWorkspaceScope(nextScope);
  }, [activeKey, activeSession?.chatId, socketRef, turnActive]);

  const forkFromMessage = useCallback(async (beforeUserIndex: number) => {
    const socket = socketRef.current;
    const chatId = chatIdFromKey(activeKey);
    if (!socket || !chatId) throw new Error(i18n.t('chat.notConnected'));
    const sourceSession = sessions.find((session) => session.key === activeKey);
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
    useChatStore.getState().selectSession(forkedKey, useSidebarStore.getState().sessions);
    void useSidebarStore.getState().refresh();
    return forkedChatId;
  }, [activeKey, sessions, sidebarTitleOverrides, socketRef]);

  const removeSession = useCallback(async (
    key: string,
    options?: { deleteAutomations?: boolean },
  ): Promise<SessionDeleteResult> => {
    if (!authenticated) return { deleted: false };
    const result = await useSidebarStore.getState().removeSession(key, options);
    if (result.deleted && activeKey === key) {
      useChatStore.getState().selectSession(null, useSidebarStore.getState().sessions);
    }
    return result;
  }, [activeKey, authenticated]);

  const logout = useCallback(async () => {
    socketRef.current?.close();
    useChatStore.getState().resetAll();
    useCapabilitiesStore.getState().resetAll();
    useSkillsStore.getState().resetAll();
    void useSidebarStore.getState().resetAll();
    void useWorkspacesStore.getState().resetAll();
    await useAuthStore.getState().logout();
  }, [socketRef]);

  return {
    forkFromMessage,
    logout,
    removeSession,
    selectCreatedChat,
    startNewChat,
    startNewChatInProject,
    updateWorkspaceScope,
  };
}
