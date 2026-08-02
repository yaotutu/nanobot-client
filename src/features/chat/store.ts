import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import i18n from '@/i18n';
import type {
  ChatSummary,
  GoalStateWsPayload,
  InboundEvent,
  StreamError,
  UIMessage,
  WorkspaceScopePayload,
} from '@/types/api';

import { normalizeWorkspaceScope } from '@/services/runtime/workspace-paths';

import { projectWebuiThreadMessages } from './thread-display-compat';
import {
  appendSideChannelMessage,
  createStreamFoldState,
  finalizeStreamedTurn,
  foldStreamEvent,
  resetStreamFoldState,
  STREAM_END_IDLE_DELAY_MS,
  type StreamFoldState,
} from './stream-fold';
import { hasPendingAgentActivity } from './activity-timeline';

/**
 * Chat store —— 当前活动聊天的状态切片。
 *
 * 设计原则：
 * - 不持有 WebSocket 生命周期 / sessions list（前者由 connection store 管；后者由 sidebar store 管）。
 * - 仅持有当前活动会话相关的"渲染态"。
 * - 入站事件由 `applyInboundEvent` 统一处理，内部使用 stream-fold 折叠。
 * - 不暴露 mutation version ref —— store 内部追踪。
 */

interface ChatState {
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

  /** 当前会话的 stream error（用于 surface 给 chat composer） */
  streamError: StreamError | null;
  /** 当前会话的 side channel turn id 集合 */
  sideChannelTurnIds: Set<string>;

  error: string | null;
}

interface ChatActions {
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

// Internal fold state —— 不进入 store 序列化
const foldState: StreamFoldState = createStreamFoldState();
let pendingStreamEvents: InboundEvent[] = [];
let pendingStreamTimer: ReturnType<typeof setTimeout> | null = null;
let streamEndTimer: ReturnType<typeof setTimeout> | null = null;

function resetFoldRuntime() {
  if (pendingStreamTimer) {
    clearTimeout(pendingStreamTimer);
    pendingStreamTimer = null;
  }
  if (streamEndTimer) {
    clearTimeout(streamEndTimer);
    streamEndTimer = null;
  }
  pendingStreamEvents = [];
  resetStreamFoldState(foldState);
}

function chatIdFromKey(key: string | null): string | null {
  if (!key) return null;
  const sep = key.indexOf(':');
  return sep < 0 ? key : key.slice(sep + 1);
}

function sameSemanticMessage(left: UIMessage, right: UIMessage): boolean {
  if (left.id && right.id && left.id === right.id) return true;
  return (
    left.role === right.role &&
    (left.kind ?? '') === (right.kind ?? '') &&
    left.content === right.content &&
    (!left.turnId || !right.turnId || left.turnId === right.turnId)
  );
}

function mergeLatestMessages(current: UIMessage[], latest: UIMessage[]): UIMessage[] {
  if (current.length === 0) return latest;
  const maxOverlap = Math.min(current.length, latest.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const start = current.length - overlap;
    let matches = true;
    for (let i = 0; i < overlap; i += 1) {
      if (!sameSemanticMessage(current[start + i], latest[i])) {
        matches = false;
        break;
      }
    }
    if (matches) return [...current.slice(0, start), ...latest];
  }
  const seenIds = new Set(current.map((m) => m.id).filter(Boolean));
  const extras = latest.filter((m) => !m.id || !seenIds.has(m.id));
  return [...extras, ...current];
}

function prependOlder(current: UIMessage[], older: UIMessage[]): UIMessage[] {
  if (older.length === 0) return current;
  const firstCurrent = current[0];
  const boundary = firstCurrent
    ? older.findIndex((m) => sameSemanticMessage(m, firstCurrent))
    : -1;
  const prefix = boundary >= 0 ? older.slice(0, boundary) : older;
  const seen = new Set(current.map((m) => m.id));
  return [...prefix.filter((m) => !seen.has(m.id)), ...current];
}


export const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set, get) => ({
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

    selectSession(key, sessions) {
      const current = get();
      const selected = key ? sessions.find((s) => s.key === key) ?? null : null;
      const chatId = chatIdFromKey(key);
      const scopeOverride = chatId ? current.workspaceOverrides[chatId] : undefined;
      const nextScope = scopeOverride
        ? scopeOverride
        : selected?.workspaceScope
          ? normalizeWorkspaceScope(selected.workspaceScope)
          : current.draftWorkspaceScope;

      resetFoldRuntime();
      set({
        activeKey: key,
        messages: [],
        turnActive: false,
        runStartedAt: null,
        goalState: undefined,
        turnModelName: null,
        draftWorkspaceScope: nextScope,
        threadLoading: Boolean(key),
        loadingOlder: false,
        beforeCursor: null,
        hasMoreBefore: false,
        userMessageOffset: 0,
        forkBoundaryMessageCount: null,
        error: null,
        streamError: null,
        sideChannelTurnIds: new Set<string>(),
      });
    },

    applyInboundEvent(event) {
      const state = get();
      const activeChatId = chatIdFromKey(state.activeKey);

      // 错误事件
      if (event.event === 'error') {
        if (event.detail === 'workspace_scope_rejected') {
          set({ error: i18n.t('errors.workspaceScopeRejected.body') });
          return;
        }
        const reason = [event.detail, (event as { reason?: string }).reason].filter(Boolean).join(': ');
        const message = reason || i18n.t('app.error.serverError', { defaultValue: 'The server returned an error' });
        set({ error: message });
        return;
      }

      // 元事件
      if (event.event === 'turn_model_updated') {
        set({ turnModelName: event.model_name.trim() || null });
        return;
      }
      if (event.event === 'goal_state') {
        set({ goalState: event.goal_state });
        return;
      }
      if (event.event === 'runtime_model_updated') {
        set((s) => ({
          runtimeModelName: event.model_name.trim() || null,
          modelSettingsRevision: s.modelSettingsRevision + 1,
        }));
        return;
      }
      if (event.event === 'goal_status') {
        const running = event.status === 'running';
        set({
          turnActive: running,
          runStartedAt: running && typeof event.started_at === 'number' ? event.started_at : null,
        });
        return;
      }

      // side-channel 检查
      const turnId = 'turn_id' in event && typeof event.turn_id === 'string' ? event.turn_id : null;
      const sideChannel = turnId ? state.sideChannelTurnIds.has(turnId) : false;
      if (sideChannel) {
        if (event.event === 'message') {
          set((s) => ({
            messages: projectWebuiThreadMessages(
              appendSideChannelMessage(s.messages, event, foldState),
            ),
            sideChannelTurnIds: (() => {
              if (!turnId) return s.sideChannelTurnIds;
              const next = new Set(s.sideChannelTurnIds);
              next.delete(turnId);
              return next;
            })(),
          }));
        } else if (event.event === 'turn_end' && turnId) {
          set((s) => {
            const next = new Set(s.sideChannelTurnIds);
            next.delete(turnId);
            return { sideChannelTurnIds: next };
          });
        }
        return;
      }

      // 不属于当前会话的事件：忽略
      if (activeChatId && 'chat_id' in event && event.chat_id && event.chat_id !== activeChatId) {
        return;
      }

      // delta 流事件：批量 flush
      if (event.event === 'delta' || event.event === 'reasoning_delta') {
        if (!('text' in event) || !event.text) return;
        if (foldState.suppressStreamUntilTurnEnd) return;
        pendingStreamEvents.push(event);
        if (!pendingStreamTimer) {
          pendingStreamTimer = setTimeout(() => {
            const pending = pendingStreamEvents;
            pendingStreamEvents = [];
            useChatStore.setState((s) => ({
              messages: pending.reduce(
                (next, ev) => foldStreamEvent(next, ev, foldState),
                s.messages,
              ),
            }));
          }, 16);
        }
        if (!state.turnActive) set({ turnActive: true });
        return;
      }

      // flush pending 后再处理非 delta 事件
      if (pendingStreamEvents.length > 0) {
        const pending = pendingStreamEvents;
        pendingStreamEvents = [];
        const base = pending.reduce(
          (acc, ev) => foldStreamEvent(acc, ev, foldState),
          get().messages,
        );
        set({ messages: base });
      }

      if (event.event === 'stream_end') {
        set((s) => ({ messages: foldStreamEvent(s.messages, event, foldState) }));
        if (foldState.suppressStreamUntilTurnEnd) return;
        if (event.resuming) {
          if (streamEndTimer) clearTimeout(streamEndTimer);
          set({ turnActive: true });
          if (!event.merge_next) {
            const t = event.turn_id ?? '';
            set((s) => ({ messages: finalizeStreamedTurn(s.messages, t ? { turnId: t } : {}) }));
          }
        } else {
          if (streamEndTimer) clearTimeout(streamEndTimer);
          const t = event.turn_id ?? '';
          streamEndTimer = setTimeout(() => {
            useChatStore.setState((s) => ({
              turnActive: false,
              runStartedAt: null,
              messages: finalizeStreamedTurn(s.messages, t ? { turnId: t } : {}),
            }));
          }, STREAM_END_IDLE_DELAY_MS);
        }
        return;
      }

      set((s) => ({ messages: foldStreamEvent(s.messages, event, foldState) }));
    },

    setTurnActive(active) {
      set({ turnActive: active });
    },

    setRunStartedAt(ts) {
      set({ runStartedAt: ts });
    },

    setGoalState(goal) {
      set({ goalState: goal });
    },

    setRuntimeModelName(name) {
      set((s) => ({
        runtimeModelName: name,
        modelSettingsRevision: s.modelSettingsRevision + 1,
      }));
    },

    setTurnModelName(name) {
      set({ turnModelName: name });
    },

    bumpModelSettingsRevision() {
      set((s) => ({ modelSettingsRevision: s.modelSettingsRevision + 1 }));
    },

    setThreadLoading(loading) {
      set({ threadLoading: loading });
    },

    setLoadingOlder(loading) {
      set({ loadingOlder: loading });
    },

    setBeforeCursor(cursor, hasMore) {
      set({ beforeCursor: cursor, hasMoreBefore: hasMore });
    },

    setUserMessageOffset(offset) {
      set({ userMessageOffset: Math.max(0, offset) });
    },

    setForkBoundaryMessageCount(count) {
      set({ forkBoundaryMessageCount: count });
    },

    prependOlder(older) {
      set((s) => ({ messages: prependOlder(s.messages, older) }));
    },

    setError(error) {
      set({ error });
    },

    clearError() {
      set({ error: null });
    },

    setDraftWorkspaceScope(scope) {
      set({ draftWorkspaceScope: scope ? normalizeWorkspaceScope(scope) : null });
    },

    setWorkspaceOverride(chatId, scope) {
      set((s) => ({
        workspaceOverrides: { ...s.workspaceOverrides, [chatId]: normalizeWorkspaceScope(scope) },
      }));
    },

    applyCanonicalHistory(messages, page) {
      const state = get();
      const latest = projectWebuiThreadMessages(messages);
      const merged = mergeLatestMessages(state.messages, latest);
      const hasPending = page.activeTurnId
        ? true
        : hasPendingAgentActivity(latest);
      if (hasPending) {
        set({ messages: merged, turnActive: true, error: null });
        return;
      }
      resetFoldRuntime();
      set({
        messages: merged,
        turnActive: false,
        runStartedAt: null,
        beforeCursor: page.beforeCursor,
        hasMoreBefore: page.hasMoreBefore,
        userMessageOffset: page.userMessageOffset,
        forkBoundaryMessageCount: page.forkBoundaryMessageCount,
        error: null,
      });
    },

    applyRunStatus(chatId, startedAt) {
      const state = get();
      if (chatIdFromKey(state.activeKey) === chatId) {
        set({ runStartedAt: startedAt });
      }
    },

    setStreamError(error) {
      set({ streamError: error });
    },

    markSideChannel(turnId) {
      set((s) => {
        const next = new Set(s.sideChannelTurnIds);
        next.add(turnId);
        return { sideChannelTurnIds: next };
      });
    },

    prepareUserTurn(turnId: string) {
      void turnId;
      resetStreamFoldState(foldState);
    },

    resetAll() {
      resetFoldRuntime();
      set({
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
      });
    },
  })),
);