import type { WorkspaceScopePayload } from '@/types/api/workspaces';

import type { ChatState } from './types';

export function createInitialChatState(): ChatState {
  return {
    activeKey: null,
    messages: [],
    turnActive: false,
    runStartedAt: null,
    goalState: undefined,
    turnModelName: null,
    runtimeModelName: null,
    modelSettingsRevision: 0,
    draftWorkspaceScope: null,
    workspaceOverrides: {},
    threadLoading: false,
    loadingOlder: false,
    beforeCursor: null,
    hasMoreBefore: false,
    userMessageOffset: 0,
    forkBoundaryMessageCount: null,
    streamError: null,
    sideChannelTurnIds: new Set<string>(),
    error: null,
  };
}

export function createSessionResetState(
  activeKey: string | null,
  draftWorkspaceScope: WorkspaceScopePayload | null,
): Partial<ChatState> {
  return {
    activeKey,
    messages: [],
    turnActive: false,
    runStartedAt: null,
    goalState: undefined,
    turnModelName: null,
    draftWorkspaceScope,
    threadLoading: Boolean(activeKey),
    loadingOlder: false,
    beforeCursor: null,
    hasMoreBefore: false,
    userMessageOffset: 0,
    forkBoundaryMessageCount: null,
    error: null,
    streamError: null,
    sideChannelTurnIds: new Set<string>(),
  };
}
