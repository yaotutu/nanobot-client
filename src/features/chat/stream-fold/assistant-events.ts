import { toMediaAttachment } from '@/services/links/media';
import type { InboundEvent, UIMessage } from '@/types/api/chat';

import {
  clearActivitySegment,
  closeActiveAssistantStream,
  ensureActivitySegmentId,
  matchesTurn,
  nextMessageId,
  replaceMessageAt,
  turnFields,
  type StreamFoldState,
  type StreamTurnFields,
} from './state';

function findStreamingAssistantIndex(
  messages: UIMessage[],
  state: StreamFoldState,
  turn: StreamTurnFields = {},
): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === 'trace') continue;
    if (
      message.role === 'assistant' &&
      message.isStreaming &&
      !state.closedAssistantStreamIds.has(message.id) &&
      matchesTurn(message, turn)
    ) return index;
    if (message.role === 'user') break;
  }
  return null;
}

function findActiveAssistantPlaceholderIndex(
  messages: UIMessage[],
  turn: StreamTurnFields = {},
): number | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant' || last.kind === 'trace') return null;
  if (last.content.length > 0 || !last.isStreaming || !matchesTurn(last, turn)) return null;
  return messages.length - 1;
}

function resolveActiveAssistantIndex(
  messages: UIMessage[],
  state: StreamFoldState,
  turn: StreamTurnFields = {},
): number | null {
  const cursor = state.activeAssistant;
  if (!cursor) return null;
  const indexed = messages[cursor.index];
  if (
    indexed?.id === cursor.id &&
    indexed.role === 'assistant' &&
    indexed.kind !== 'trace' &&
    indexed.isStreaming &&
    matchesTurn(indexed, turn)
  ) return cursor.index;
  const index = messages.findIndex((message) => message.id === cursor.id);
  if (index < 0) {
    state.activeAssistant = null;
    return null;
  }
  const found = messages[index];
  if (
    found.role !== 'assistant' ||
    found.kind === 'trace' ||
    !found.isStreaming ||
    !matchesTurn(found, turn)
  ) {
    state.activeAssistant = null;
    return null;
  }
  state.activeAssistant = { id: cursor.id, index };
  return index;
}

export function closeReasoningStream(messages: UIMessage[]): UIMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (!candidate.reasoningStreaming) continue;
    const latencyMs = candidate.latencyMs === undefined && candidate.createdAt > 1_000_000_000_000
      ? Math.max(0, Math.round(Date.now() - candidate.createdAt))
      : candidate.latencyMs;
    return replaceMessageAt(messages, index, {
      ...candidate,
      reasoningStreaming: false,
      ...(latencyMs !== undefined ? { latencyMs } : {}),
    });
  }
  return messages;
}

export function attachReasoningChunk(
  messages: UIMessage[],
  chunk: string,
  state: StreamFoldState,
  turn: StreamTurnFields,
): UIMessage[] {
  if (closeActiveAssistantStream(state)) clearActivitySegment(state);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role === 'user' || candidate.kind === 'trace') break;
    if (candidate.role !== 'assistant') continue;
    if (!matchesTurn(candidate, turn) || candidate.content.length > 0) break;
    if (candidate.reasoningStreaming || candidate.reasoning !== undefined || candidate.isStreaming) {
      return replaceMessageAt(messages, index, {
        ...candidate,
        reasoning: `${candidate.reasoning ?? ''}${chunk}`,
        reasoningStreaming: true,
        isStreaming: true,
        activitySegmentId: candidate.activitySegmentId ?? ensureActivitySegmentId(state),
        ...turn,
      });
    }
    break;
  }
  return [
    ...messages,
    {
      id: nextMessageId(state, 'reasoning', turn.turnId),
      role: 'assistant',
      content: '',
      reasoning: chunk,
      reasoningStreaming: true,
      isStreaming: true,
      activitySegmentId: ensureActivitySegmentId(state),
      ...turn,
      createdAt: Date.now(),
    },
  ];
}

export function appendAnswerChunk(
  messages: UIMessage[],
  chunk: string,
  state: StreamFoldState,
  turn: StreamTurnFields,
): UIMessage[] {
  clearActivitySegment(state);
  let next = messages;
  let targetIndex = resolveActiveAssistantIndex(next, state, turn);
  targetIndex ??= findActiveAssistantPlaceholderIndex(next, turn);
  targetIndex ??= findStreamingAssistantIndex(next, state, turn);
  if (targetIndex === null) {
    const id = nextMessageId(state, 'assistant', turn.turnId);
    next = [
      ...next,
      {
        id,
        role: 'assistant',
        content: '',
        isStreaming: true,
        ...turn,
        createdAt: Date.now(),
      },
    ];
    targetIndex = next.length - 1;
  }
  const target = next[targetIndex];
  const merged: UIMessage = {
    ...target,
    content: `${target.content}${chunk}`,
    isStreaming: true,
    ...turn,
  };
  state.closedAssistantStreamIds.delete(merged.id);
  state.activeAssistant = { id: merged.id, index: targetIndex };
  state.bufferMessageId = merged.id;
  return replaceMessageAt(next, targetIndex, merged);
}

export function applyStreamEnd(
  messages: UIMessage[],
  event: Extract<InboundEvent, { event: 'stream_end' }>,
  state: StreamFoldState,
): UIMessage[] {
  const turn = turnFields(event, 'answer');
  let next = messages;
  if (typeof event.text === 'string') {
    const targetIndex = resolveActiveAssistantIndex(next, state, turn)
      ?? findStreamingAssistantIndex(next, state, turn);
    if (targetIndex !== null) {
      const target = next[targetIndex];
      const merged: UIMessage = { ...target, content: event.text, isStreaming: true, ...turn };
      next = replaceMessageAt(next, targetIndex, merged);
      if (event.resuming === true && event.merge_next === true) {
        state.closedAssistantStreamIds.delete(merged.id);
        state.activeAssistant = { id: merged.id, index: targetIndex };
        state.bufferMessageId = merged.id;
      }
    } else {
      const id = nextMessageId(state, 'assistant', turn.turnId);
      next = [...next, {
        id,
        role: 'assistant',
        content: event.text,
        isStreaming: true,
        ...turn,
        createdAt: Date.now(),
      }];
      if (event.resuming === true && event.merge_next === true) {
        state.activeAssistant = { id, index: next.length - 1 };
        state.bufferMessageId = id;
      } else {
        state.closedAssistantStreamIds.add(id);
      }
    }
  }
  if (!(event.resuming === true && event.merge_next === true)) closeActiveAssistantStream(state);
  return next;
}

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
