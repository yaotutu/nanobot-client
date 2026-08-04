import type { InboundEvent } from '@/types/api/chat/events';
import type { StreamError } from '@/types/api/chat/errors';
import type { UIMessage } from '@/types/api/chat/messages';
import type { GoalStateWsPayload } from '@/types/api/runtime';
import type { ChatSummary } from '@/types/api/sidebar';
import type { WorkspaceScopePayload } from '@/types/api/workspaces';

export interface ChatState {
  activeKey: string | null;
  messages: UIMessage[];
  turnActive: boolean;
  runStartedAt: number | null;
  goalState: GoalStateWsPayload | undefined;
  turnModelName: string | null;
  runtimeModelName: string | null;
  modelSettingsRevision: number;
  draftWorkspaceScope: WorkspaceScopePayload | null;
  workspaceOverrides: Record<string, WorkspaceScopePayload>;
  threadLoading: boolean;
  loadingOlder: boolean;
  beforeCursor: string | null;
  hasMoreBefore: boolean;
  userMessageOffset: number;
  forkBoundaryMessageCount: number | null;
  streamError: StreamError | null;
  sideChannelTurnIds: Set<string>;
  error: string | null;
}

export interface ChatActions {
  selectSession(key: string | null, sessions: ChatSummary[]): void;
  applyInboundEvent(event: InboundEvent): void;
  setTurnActive(active: boolean): void;
  setRunStartedAt(ts: number | null): void;
  setGoalState(goal: GoalStateWsPayload): void;
  setRuntimeModelName(name: string | null): void;
  setTurnModelName(name: string | null): void;
  bumpModelSettingsRevision(): void;
  setThreadLoading(loading: boolean): void;
  setLoadingOlder(loading: boolean): void;
  setBeforeCursor(cursor: string | null, hasMore: boolean): void;
  setUserMessageOffset(offset: number): void;
  setForkBoundaryMessageCount(count: number | null): void;
  prependOlder(older: UIMessage[]): void;
  setError(error: string | null): void;
  clearError(): void;
  setDraftWorkspaceScope(scope: WorkspaceScopePayload | null): void;
  setWorkspaceOverride(chatId: string, scope: WorkspaceScopePayload): void;
  applyCanonicalHistory(
    messages: UIMessage[],
    page: {
      beforeCursor: string | null;
      hasMoreBefore: boolean;
      userMessageOffset: number;
      forkBoundaryMessageCount: number | null;
      activeTurnId: string | null;
    },
  ): void;
  applyRunStatus(chatId: string, startedAt: number | null): void;
  setStreamError(error: StreamError | null): void;
  markSideChannel(turnId: string): void;
  prepareUserTurn(turnId: string): void;
  resetAll(): void;
}

export type ChatStore = ChatState & ChatActions;
