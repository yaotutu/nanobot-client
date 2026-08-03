import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { normalizeWorkspaceScope } from '@/services/runtime/workspace-paths';

import { hasPendingAgentActivity } from './activity/model/activity-timeline';
import { projectWebuiThreadMessages } from './model/thread-display-compat';
import { chatIdFromKey } from './model/chat-key';
import {
  mergeLatestMessages,
  prependOlderMessages,
} from './store/message-reconciliation';
import { createInitialChatState, createSessionResetState } from './store/chat-state-factories';
import { handleChatInboundEvent } from './store/inbound-event-handler';
import { ChatStreamRuntime } from './store/stream-runtime';
import type { ChatStore } from './store/types';

export type { ChatStore } from './store/types';

/**
 * Chat store —— 当前活动聊天的状态切片。
 *
 * 设计原则：
 * - 不持有 WebSocket 生命周期 / sessions list（前者由 connection store 管；后者由 sidebar store 管）。
 * - 仅持有当前活动会话相关的"渲染态"。
 * - 入站事件由 `applyInboundEvent` 统一处理，内部使用 stream-fold 折叠。
 * - 不暴露 mutation version ref —— store 内部追踪。
 */

const streamRuntime = new ChatStreamRuntime();


export const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialChatState(),

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

      streamRuntime.reset();
      set(createSessionResetState(key, nextScope));
    },

    applyInboundEvent(event) {
      handleChatInboundEvent({
        event,
        get,
        set,
        streamRuntime,
      });
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
      set((s) => ({ messages: prependOlderMessages(s.messages, older) }));
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
      streamRuntime.reset();
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
        // goal_status is the server's authoritative run lifecycle signal.
        // Keep the composer in sync even if the final turn_end frame is lost
        // during a reconnect or arrives after the UI has already rendered the
        // assistant reply.
        set({
          runStartedAt: startedAt,
          turnActive: startedAt !== null,
        });
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
      streamRuntime.prepareTurn();
    },

    resetAll() {
      streamRuntime.reset();
      set(createInitialChatState());
    },
  })),
);