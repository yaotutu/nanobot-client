import { SocketListeners } from '@/features/connection/socket-listeners';
import { SocketPendingRegistry } from '@/features/connection/socket-pending-registry';
import {
  eventTurnId,
  isSystemCommandTurnId,
} from '@/features/connection/socket-protocol';
import type { InboundEvent } from '@/types/api/chat/events';

interface SocketInboundContext {
  listeners: SocketListeners;
  pending: SocketPendingRegistry;
  knownChats: Set<string>;
}

export function inboundEventError(event: InboundEvent): Error {
  const detail = 'detail' in event && typeof event.detail === 'string'
    ? event.detail
    : '';
  const reason = 'reason' in event && typeof event.reason === 'string'
    ? event.reason
    : '';
  return new Error([detail, reason].filter(Boolean).join(': '));
}

export function routeSocketInboundEvent(
  event: InboundEvent,
  context: SocketInboundContext,
): void {
  const { listeners, pending, knownChats } = context;

  if (event.event === 'transcription_result') {
    pending.resolveTranscription(event.request_id, event.text);
    return;
  }
  if (event.event === 'transcription_error') {
    pending.rejectTranscription(event.request_id, event.detail);
    return;
  }

  const turnId = eventTurnId(event);
  if (isSystemCommandTurnId(turnId)) {
    if (event.event === 'error') {
      pending.rejectSystemCommand(turnId, inboundEventError(event));
    } else if (event.event === 'message' || event.event === 'turn_end') {
      pending.resolveSystemCommand(turnId);
    }
    return;
  }

  if (event.event === 'message_accepted') {
    pending.acceptMessage(event.chat_id, event.turn_id);
    return;
  }

  if (event.event === 'error' && event.chat_id && turnId) {
    pending.rejectMessage(event.chat_id, turnId, inboundEventError(event));
    if (event.detail !== 'workspace_scope_rejected') {
      listeners.emitTransportError({
        kind: 'turn_rejected',
        chatId: event.chat_id,
        turnId,
        detail: event.detail,
        reason: (event as { reason?: string }).reason,
      });
    }
  }

  if (event.event === 'error' && event.detail === 'workspace_scope_rejected') {
    listeners.emitTransportError({
      kind: 'workspace_scope_rejected',
      chatId: event.chat_id,
      turnId: turnId ?? undefined,
      reason: (event as { reason?: string }).reason,
    });
  }

  if (event.event === 'goal_status') {
    if (event.status === 'running') {
      if (typeof event.started_at === 'number') {
        listeners.setRunStatus(event.chat_id, event.started_at);
      }
      pending.acceptFallback(event.chat_id, true);
    } else if (event.status === 'idle') {
      listeners.clearRunStatus(event.chat_id);
    }
  }

  if (
    'chat_id' in event
    && event.chat_id
    && ['delta', 'reasoning_delta', 'message', 'stream_end', 'turn_end'].includes(event.event)
  ) {
    pending.acceptFallback(event.chat_id);
  }

  if ((event.event === 'ready' || event.event === 'attached') && event.chat_id) {
    knownChats.add(event.chat_id);
    pending.resolveNewChat(event.chat_id);
    return;
  }

  listeners.emitEvent(event);
}
