/**
 * 归并 assistant answer chunk 与 stream_end 事件。
 *
 * activeAssistant 是性能游标，不是唯一真相；消息数组可能因 trace 插入或完成事件而重排，
 * 因此每次先校验游标，失效时再按消息 id 和 turn 回退查找。所有更新都返回新数组，只有
 * StreamFoldState 中的流控制游标会原地更新。
 */
import type { InboundEvent } from '@/types/api/chat/events';
import type { UIMessage } from '@/types/api/chat/messages';

import {
  clearActivitySegment,
  closeActiveAssistantStream,
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
