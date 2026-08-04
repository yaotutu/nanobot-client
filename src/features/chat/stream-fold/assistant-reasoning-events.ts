/**
 * 归并 assistant reasoning 流事件。
 *
 * reasoning 与最终 answer 使用同一条 UIMessage，但具有独立的流关闭语义：收到答案块时
 * 必须结束 reasoningStreaming，而 reasoning chunk 只能合并到同一 turn 的空答案消息中，
 * 避免跨用户消息、trace 或并发 turn 串流。
 */
import type { UIMessage } from '@/types/api/chat/messages';

import {
  clearActivitySegment,
  closeActiveAssistantStream,
  ensureActivitySegmentId,
  matchesTurn,
  nextMessageId,
  replaceMessageAt,
  type StreamFoldState,
  type StreamTurnFields,
} from './state';

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
