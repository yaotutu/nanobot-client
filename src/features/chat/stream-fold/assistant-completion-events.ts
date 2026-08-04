/**
 * 处理 assistant 完整消息和 turn 收尾。
 *
 * 完成事件可能与此前的 reasoning 占位、answer buffer 或 side-channel 消息重叠。本模块负责
 * 删除临时 buffer、吸收 reasoning-only 占位，并在 turn 结束时统一关闭仍处于 streaming 的消息。
 */
import { toMediaAttachment } from '@/services/links/media';
import type { InboundEvent } from '@/types/api/chat/events';
import type { UIMessage } from '@/types/api/chat/messages';

import {
  clearActivitySegment,
  matchesTurn,
  nextMessageId,
  replaceMessageAt,
  turnFields,
  type StreamFoldState,
  type StreamTurnFields,
} from './state';

function isReasoningOnlyPlaceholder(message: UIMessage): boolean {
  return message.role === 'assistant' &&
    message.kind !== 'trace' &&
    message.content.trim().length === 0 &&
    Boolean(message.reasoning) &&
    !message.reasoningStreaming &&
    !message.media?.length;
}

export function pruneReasoningOnlyPlaceholders(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message, index) => {
    if (!isReasoningOnlyPlaceholder(message)) return true;
    return messages[index + 1]?.kind === 'trace';
  });
}

export function stampLastAssistantCompletion(
  messages: UIMessage[],
  event: Extract<InboundEvent, { event: 'turn_end' }>,
): UIMessage[] {
  const completedAt = Date.now();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message.role === 'assistant' &&
      message.kind !== 'trace' &&
      (!event.turn_id || !message.turnId || message.turnId === event.turn_id)
    ) {
      return replaceMessageAt(messages, index, {
        ...message,
        isStreaming: false,
        completedAt,
        ...(typeof event.latency_ms === 'number' && event.latency_ms >= 0
          ? { latencyMs: Math.round(event.latency_ms) }
          : {}),
      });
    }
  }
  return messages;
}

function absorbCompleteAssistantMessage(
  messages: UIMessage[],
  message: Omit<UIMessage, 'id' | 'role' | 'createdAt'>,
  state: StreamFoldState,
): UIMessage[] {
  const last = messages[messages.length - 1];
  if (!last || !isReasoningOnlyPlaceholder(last) || !matchesTurn(last, message)) {
    return [...messages, {
      id: nextMessageId(state, 'assistant', message.turnId),
      role: 'assistant',
      createdAt: Date.now(),
      ...message,
    }];
  }
  return replaceMessageAt(messages, messages.length - 1, {
    ...last,
    ...message,
    isStreaming: false,
    reasoningStreaming: false,
  });
}

function mediaFromMessageEvent(event: Extract<InboundEvent, { event: 'message' }>) {
  const rows = event.media_urls?.length
    ? event.media_urls.map((media) => toMediaAttachment(media))
    : event.media?.map((url) => toMediaAttachment({ url }));
  return rows?.length ? rows : undefined;
}

export function completeAssistantMessage(
  messages: UIMessage[],
  event: Extract<InboundEvent, { event: 'message' }>,
  state: StreamFoldState,
): UIMessage[] {
  clearActivitySegment(state);
  const activeId = state.bufferMessageId;
  state.bufferMessageId = null;
  state.activeAssistant = null;
  const filtered = activeId ? messages.filter((message) => message.id !== activeId) : messages;
  const media = mediaFromMessageEvent(event);
  if (media) state.suppressStreamUntilTurnEnd = true;
  return absorbCompleteAssistantMessage(filtered, {
    content: event.text,
    ...(media ? { media } : {}),
    ...(event.source ? { source: event.source } : {}),
    ...(typeof event.latency_ms === 'number' && event.latency_ms >= 0
      ? { latencyMs: Math.round(event.latency_ms) }
      : {}),
    ...turnFields(event, 'answer'),
  }, state);
}

export function appendSideChannelMessage(
  messages: UIMessage[],
  event: Extract<InboundEvent, { event: 'message' }>,
  state: StreamFoldState,
): UIMessage[] {
  const media = mediaFromMessageEvent(event);
  return absorbCompleteAssistantMessage(messages, {
    content: event.text,
    ...(media ? { media } : {}),
    ...(event.source ? { source: event.source } : {}),
    ...(typeof event.latency_ms === 'number' && event.latency_ms >= 0
      ? { latencyMs: Math.round(event.latency_ms) }
      : {}),
    ...turnFields(event, 'answer'),
  }, state);
}

export function finalizeStreamedTurn(
  messages: UIMessage[],
  turn: StreamTurnFields = {},
): UIMessage[] {
  return messages.map((message) =>
    message.isStreaming && matchesTurn(message, turn)
      ? { ...message, isStreaming: false, reasoningStreaming: false }
      : message,
  );
}
