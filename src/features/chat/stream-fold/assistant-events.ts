/** Compatibility entrypoint for assistant stream-fold handlers. */
export { appendAnswerChunk, applyStreamEnd } from './assistant-answer-events';
export {
  appendSideChannelMessage,
  completeAssistantMessage,
  finalizeStreamedTurn,
  pruneReasoningOnlyPlaceholders,
  stampLastAssistantCompletion,
} from './assistant-completion-events';
export { attachReasoningChunk, closeReasoningStream } from './assistant-reasoning-events';
