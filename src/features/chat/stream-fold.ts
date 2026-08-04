import {
  appendAnswerChunk,
  appendSideChannelMessage,
  applyStreamEnd,
  attachReasoningChunk,
  closeReasoningStream,
  completeAssistantMessage,
  finalizeStreamedTurn,
  pruneReasoningOnlyPlaceholders,
  stampLastAssistantCompletion,
} from '@/features/chat/stream-fold/assistant-events';
import {
  mergeActivityTrace,
  mergeFileEditTrace,
} from '@/features/chat/stream-fold/activity-events';
import {
  clearActivitySegment,
  createStreamFoldState,
  prepareStreamFoldForUserTurn,
  resetStreamFoldState,
  turnFields,
  type StreamFoldState,
  type StreamTurnFields,
} from '@/features/chat/stream-fold/state';
import type { InboundEvent } from '@/types/api/chat/events';
import type { UIMessage } from '@/types/api/chat/messages';

export const STREAM_END_IDLE_DELAY_MS = 1_000;

export {
  appendSideChannelMessage,
  createStreamFoldState,
  finalizeStreamedTurn,
  prepareStreamFoldForUserTurn,
  resetStreamFoldState,
};
export type { StreamFoldState, StreamTurnFields };

export function foldStreamEvent(
  messages: UIMessage[],
  event: InboundEvent,
  state: StreamFoldState,
): UIMessage[] {
  if (!('chat_id' in event) || !event.chat_id) return messages;
  if (state.suppressStreamUntilTurnEnd && event.event !== 'turn_end') {
    if (
      event.event === 'delta' ||
      event.event === 'reasoning_delta' ||
      event.event === 'reasoning_end' ||
      event.event === 'file_edit' ||
      (event.event === 'message' && Boolean(event.kind))
    ) return messages;
  }
  if (event.event === 'delta') {
    return event.text
      ? appendAnswerChunk(messages, event.text, state, turnFields(event, 'answer'))
      : messages;
  }
  if (event.event === 'reasoning_delta') {
    if (state.fileEditSegmentId) clearActivitySegment(state);
    return event.text
      ? attachReasoningChunk(messages, event.text, state, turnFields(event, 'reasoning'))
      : messages;
  }
  if (event.event === 'stream_end') return applyStreamEnd(messages, event, state);
  if (event.event === 'reasoning_end') return closeReasoningStream(messages);
  if (event.event === 'file_edit') return mergeFileEditTrace(messages, event, state);
  if (event.event === 'message' && event.kind === 'reasoning') {
    if (state.fileEditSegmentId) clearActivitySegment(state);
    return closeReasoningStream(
      attachReasoningChunk(messages, event.text, state, turnFields(event, 'reasoning')),
    );
  }
  if (event.event === 'message' && (event.kind === 'tool_hint' || event.kind === 'progress')) {
    return mergeActivityTrace(messages, event, state);
  }
  if (event.event === 'message') return completeAssistantMessage(messages, event, state);
  if (event.event === 'turn_end') {
    let finalized = finalizeStreamedTurn(messages, turnFields(event, 'complete'));
    finalized = pruneReasoningOnlyPlaceholders(finalized);
    finalized = stampLastAssistantCompletion(finalized, event);
    resetStreamFoldState(state);
    return finalized;
  }
  return messages;
}

export function streamEventTurn(
  event: InboundEvent,
  fallback?: UIMessage['turnPhase'],
): StreamTurnFields {
  return turnFields(event, fallback);
}

export function eventExtendsModelActivity(event: InboundEvent): boolean {
  if (event.event === 'delta' || event.event === 'reasoning_delta' || event.event === 'file_edit') {
    return true;
  }
  return event.event === 'message' &&
    (event.kind === 'tool_hint' || event.kind === 'progress' || event.kind === 'reasoning');
}
