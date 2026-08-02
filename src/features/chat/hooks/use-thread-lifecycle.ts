import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { fetchThread } from '@/features/chat/api';
import { hasPendingAgentActivity } from '@/features/chat/activity-timeline';
import { useChatStore } from '@/features/chat/store';
import { useConnectionStore } from '@/features/connection/store';
import type { NanobotSocket } from '@/features/connection/socket-transport';
import i18n from '@/i18n';

import { chatIdFromKey } from '../model/chat-key';

function isAbortError(caught: unknown): boolean {
  return caught instanceof Error && caught.name === 'AbortError';
}

function currentThreadMatches(requestKey: string): boolean {
  return useChatStore.getState().activeKey === requestKey;
}

export function useCanonicalRefresh(activeKey: string | null, enabled: boolean): () => Promise<void> {
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return useCallback(async () => {
    if (!activeKey || !enabled) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestKey = activeKey;
    try {
      const thread = await fetchThread(requestKey, {
        limit: 160,
        direction: 'latest',
        signal: controller.signal,
      });
      if (!thread || controller.signal.aborted || !currentThreadMatches(requestKey)) return;
      const hasPending = Boolean(
        thread.active_turn_id
          || (typeof thread.has_pending_tool_calls === 'boolean'
            ? thread.has_pending_tool_calls
            : hasPendingAgentActivity(thread.messages)),
      );
      if (hasPending) {
        useChatStore.getState().setTurnActive(true);
        return;
      }
      useChatStore.getState().applyCanonicalHistory(thread.messages, {
        beforeCursor: thread.page?.before_cursor ?? null,
        hasMoreBefore: Boolean(thread.page?.has_more_before),
        userMessageOffset: Math.max(0, thread.page?.user_message_offset ?? 0),
        forkBoundaryMessageCount:
          typeof thread.fork_boundary_message_count === 'number'
            ? thread.fork_boundary_message_count
            : null,
        activeTurnId: thread.active_turn_id ?? null,
      });
      useConnectionStore.getState().clearReconnectNeeded();
    } catch (caught) {
      if (isAbortError(caught)) return;
      const message = caught instanceof Error ? caught.message : i18n.t('chat.resyncFailed');
      useChatStore.getState().setError(message);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [activeKey, enabled]);
}

export function useThreadLifecycle({
  activeKey,
  enabled,
  socketRef,
}: {
  activeKey: string | null;
  enabled: boolean;
  socketRef: RefObject<NanobotSocket | null>;
}): { loadOlder: () => Promise<void> } {
  const loadControllerRef = useRef<AbortController | null>(null);
  const olderControllerRef = useRef<AbortController | null>(null);
  const loadingOlder = useChatStore((state) => state.loadingOlder);

  useEffect(() => {
    loadControllerRef.current?.abort();
    if (!activeKey || !enabled) {
      useChatStore.getState().setThreadLoading(false);
      return;
    }
    const controller = new AbortController();
    loadControllerRef.current = controller;
    const requestKey = activeKey;
    useChatStore.getState().setThreadLoading(true);
    socketRef.current?.attach(chatIdFromKey(requestKey) ?? '');

    void fetchThread(requestKey, {
      limit: 160,
      direction: 'latest',
      signal: controller.signal,
    })
      .then((thread) => {
        if (!thread || controller.signal.aborted || !currentThreadMatches(requestKey)) return;
        const threadActive = Boolean(
          thread.active_turn_id
            || (typeof thread.has_pending_tool_calls === 'boolean'
              ? thread.has_pending_tool_calls
              : hasPendingAgentActivity(thread.messages)),
        );
        useChatStore.getState().applyCanonicalHistory(thread.messages, {
          beforeCursor: thread.page?.before_cursor ?? null,
          hasMoreBefore: Boolean(thread.page?.has_more_before),
          userMessageOffset: Math.max(0, thread.page?.user_message_offset ?? 0),
          forkBoundaryMessageCount:
            typeof thread.fork_boundary_message_count === 'number'
              ? thread.fork_boundary_message_count
              : null,
          activeTurnId: thread.active_turn_id ?? null,
        });
        useChatStore.getState().setTurnActive(threadActive);
        if (!threadActive) useChatStore.getState().setRunStartedAt(null);
      })
      .catch((caught) => {
        if (isAbortError(caught)) return;
        const message = caught instanceof Error ? caught.message : i18n.t('chat.loadThreadFailed');
        useChatStore.getState().setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted && currentThreadMatches(requestKey)) {
          useChatStore.getState().setThreadLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (currentThreadMatches(requestKey)) useChatStore.getState().setThreadLoading(false);
    };
  }, [activeKey, enabled, socketRef]);

  useEffect(() => () => olderControllerRef.current?.abort(), []);

  const loadOlder = useCallback(async () => {
    if (!activeKey || !enabled || loadingOlder) return;
    olderControllerRef.current?.abort();
    const controller = new AbortController();
    olderControllerRef.current = controller;
    const requestKey = activeKey;
    useChatStore.getState().setLoadingOlder(true);
    try {
      const thread = await fetchThread(requestKey, {
        limit: 120,
        before: useChatStore.getState().beforeCursor ?? '',
        signal: controller.signal,
      });
      if (!thread || controller.signal.aborted || !currentThreadMatches(requestKey)) return;
      const store = useChatStore.getState();
      store.prependOlder(thread.messages);
      store.setBeforeCursor(thread.page?.before_cursor ?? null, Boolean(thread.page?.has_more_before));
      store.setUserMessageOffset(Math.max(0, thread.page?.user_message_offset ?? 0));
      store.setForkBoundaryMessageCount(
        typeof thread.fork_boundary_message_count === 'number'
          ? thread.fork_boundary_message_count
          : null,
      );
    } catch (caught) {
      if (isAbortError(caught)) return;
      const message = caught instanceof Error ? caught.message : i18n.t('thread.loadEarlierFailed');
      useChatStore.getState().setError(message);
    } finally {
      if (olderControllerRef.current === controller) olderControllerRef.current = null;
      if (currentThreadMatches(requestKey)) useChatStore.getState().setLoadingOlder(false);
    }
  }, [activeKey, enabled, loadingOlder]);

  return { loadOlder };
}
