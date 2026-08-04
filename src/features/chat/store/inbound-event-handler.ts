import type { StoreApi } from 'zustand';

import i18n from '@/i18n';
import type { InboundEvent } from '@/types/api/chat/events';

import { projectWebuiThreadMessages } from '../model/thread-display-compat';
import { finalizeStreamedTurn } from '../stream-fold';
import { chatIdFromKey } from '../model/chat-key';
import { ChatStreamRuntime } from './stream-runtime';
import type { ChatStore } from './types';

type ChatStoreSetter = StoreApi<ChatStore>['setState'];

interface ChatInboundEventContext {
  event: InboundEvent;
  get: () => ChatStore;
  set: ChatStoreSetter;
  streamRuntime: ChatStreamRuntime;
}

function eventTurnId(event: InboundEvent): string | null {
  return 'turn_id' in event && typeof event.turn_id === 'string'
    ? event.turn_id
    : null;
}

function handleErrorEvent(
  event: Extract<InboundEvent, { event: 'error' }>,
  set: ChatStoreSetter,
): void {
  if (event.detail === 'workspace_scope_rejected') {
    set({ error: i18n.t('errors.workspaceScopeRejected.body') });
    return;
  }
  const reason = [event.detail, (event as { reason?: string }).reason]
    .filter(Boolean)
    .join(': ');
  set({
    error: reason || i18n.t('app.error.serverError', {
      defaultValue: 'The server returned an error',
    }),
  });
}

function handleMetadataEvent(
  event: InboundEvent,
  set: ChatStoreSetter,
): boolean {
  if (event.event === 'turn_model_updated') {
    set({ turnModelName: event.model_name.trim() || null });
    return true;
  }
  if (event.event === 'goal_state') {
    set({ goalState: event.goal_state });
    return true;
  }
  if (event.event === 'runtime_model_updated') {
    set((state) => ({
      runtimeModelName: event.model_name.trim() || null,
      modelSettingsRevision: state.modelSettingsRevision + 1,
    }));
    return true;
  }
  if (event.event === 'goal_status') {
    const running = event.status === 'running';
    set({
      turnActive: running,
      runStartedAt: running && typeof event.started_at === 'number'
        ? event.started_at
        : null,
    });
    return true;
  }
  return false;
}

function handleSideChannelEvent(options: {
  event: InboundEvent;
  turnId: string;
  set: ChatStoreSetter;
  streamRuntime: ChatStreamRuntime;
}): void {
  const { event, turnId, set, streamRuntime } = options;
  if (event.event === 'message') {
    set((state) => {
      const nextTurnIds = new Set(state.sideChannelTurnIds);
      nextTurnIds.delete(turnId);
      return {
        messages: projectWebuiThreadMessages(
          streamRuntime.appendSideChannel(state.messages, event),
        ),
        sideChannelTurnIds: nextTurnIds,
      };
    });
  } else if (event.event === 'turn_end') {
    set((state) => {
      const nextTurnIds = new Set(state.sideChannelTurnIds);
      nextTurnIds.delete(turnId);
      return { sideChannelTurnIds: nextTurnIds };
    });
  }
}

function handleDeltaEvent(options: {
  event: Extract<InboundEvent, { event: 'delta' | 'reasoning_delta' }>;
  state: ChatStore;
  set: ChatStoreSetter;
  streamRuntime: ChatStreamRuntime;
}): void {
  const { event, state, set, streamRuntime } = options;
  if (!event.text || streamRuntime.suppressesStream) return;
  streamRuntime.enqueue(event, (pending) => {
    set((current) => ({
      messages: pending.reduce(
        (next, pendingEvent) => streamRuntime.fold(next, pendingEvent),
        current.messages,
      ),
    }));
  });
  if (!state.turnActive) set({ turnActive: true });
}

function handleStreamEndEvent(options: {
  event: Extract<InboundEvent, { event: 'stream_end' }>;
  set: ChatStoreSetter;
  streamRuntime: ChatStreamRuntime;
}): void {
  const { event, set, streamRuntime } = options;
  set((state) => ({ messages: streamRuntime.fold(state.messages, event) }));
  if (streamRuntime.suppressesStream) return;

  streamRuntime.cancelStreamEnd();
  const turnId = event.turn_id ?? '';
  if (event.resuming) {
    set({ turnActive: true });
    if (!event.merge_next) {
      set((state) => ({
        messages: finalizeStreamedTurn(
          state.messages,
          turnId ? { turnId } : {},
        ),
      }));
    }
    return;
  }

  streamRuntime.scheduleStreamEnd(() => {
    set((current) => ({
      turnActive: false,
      runStartedAt: null,
      messages: finalizeStreamedTurn(
        current.messages,
        turnId ? { turnId } : {},
      ),
    }));
  });
}

export function handleChatInboundEvent({
  event,
  get,
  set,
  streamRuntime,
}: ChatInboundEventContext): void {
  const state = get();

  if (event.event === 'error') {
    handleErrorEvent(event, set);
    return;
  }
  if (handleMetadataEvent(event, set)) return;

  const turnId = eventTurnId(event);
  if (turnId && state.sideChannelTurnIds.has(turnId)) {
    handleSideChannelEvent({ event, turnId, set, streamRuntime });
    return;
  }

  const activeChatId = chatIdFromKey(state.activeKey);
  if (
    activeChatId
    && 'chat_id' in event
    && event.chat_id
    && event.chat_id !== activeChatId
  ) {
    return;
  }

  if (event.event === 'delta' || event.event === 'reasoning_delta') {
    handleDeltaEvent({ event, state, set, streamRuntime });
    return;
  }

  const currentMessages = get().messages;
  const messagesWithPending = streamRuntime.foldPending(currentMessages);
  if (messagesWithPending !== get().messages) {
    set({ messages: messagesWithPending });
  }

  if (event.event === 'stream_end') {
    handleStreamEndEvent({ event, set, streamRuntime });
    return;
  }

  if (event.event === 'turn_end') {
    streamRuntime.cancelStreamEnd();
    set((current) => ({
      turnActive: false,
      runStartedAt: null,
      messages: streamRuntime.fold(current.messages, event),
    }));
    return;
  }

  set((current) => ({
    messages: streamRuntime.fold(current.messages, event),
  }));
}
