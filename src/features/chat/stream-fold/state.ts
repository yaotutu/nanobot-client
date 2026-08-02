import type { InboundEvent, UIMessage } from '@/types/api/chat';

export type StreamTurnFields = Pick<UIMessage, 'turnId' | 'turnPhase' | 'turnSeq'>;

interface ActiveAssistantCursor {
  id: string;
  index: number;
}

export interface StreamFoldState {
  bufferMessageId: string | null;
  activeAssistant: ActiveAssistantCursor | null;
  closedAssistantStreamIds: Set<string>;
  activitySegmentId: string | null;
  fileEditSegmentId: string | null;
  activitySegmentCounter: number;
  messageCounter: number;
  suppressStreamUntilTurnEnd: boolean;
}

export function createStreamFoldState(): StreamFoldState {
  return {
    bufferMessageId: null,
    activeAssistant: null,
    closedAssistantStreamIds: new Set(),
    activitySegmentId: null,
    fileEditSegmentId: null,
    activitySegmentCounter: 0,
    messageCounter: 0,
    suppressStreamUntilTurnEnd: false,
  };
}

export function resetStreamFoldState(state: StreamFoldState): void {
  state.bufferMessageId = null;
  state.activeAssistant = null;
  state.closedAssistantStreamIds.clear();
  state.activitySegmentId = null;
  state.fileEditSegmentId = null;
  state.suppressStreamUntilTurnEnd = false;
}

export function prepareStreamFoldForUserTurn(state: StreamFoldState): void {
  resetStreamFoldState(state);
}

export function nextMessageId(
  state: StreamFoldState,
  prefix: string,
  turnId?: string,
): string {
  state.messageCounter += 1;
  return `${prefix}-${turnId ?? 'legacy'}-${Date.now()}-${state.messageCounter}`;
}

export function turnFields(
  event: InboundEvent,
  fallback?: UIMessage['turnPhase'],
): StreamTurnFields {
  const turnId = 'turn_id' in event && typeof event.turn_id === 'string' && event.turn_id
    ? event.turn_id
    : undefined;
  const rawPhase = 'turn_phase' in event && typeof event.turn_phase === 'string'
    ? event.turn_phase
    : undefined;
  const turnPhase = rawPhase ?? fallback;
  const turnSeq = 'turn_seq' in event && typeof event.turn_seq === 'number' && Number.isFinite(event.turn_seq)
    ? event.turn_seq
    : undefined;
  return {
    ...(turnId ? { turnId } : {}),
    ...(turnPhase ? { turnPhase: turnPhase as UIMessage['turnPhase'] } : {}),
    ...(turnSeq !== undefined ? { turnSeq } : {}),
  };
}

export function matchesTurn(
  message: UIMessage,
  turn: StreamTurnFields = {},
): boolean {
  return !turn.turnId || !message.turnId || message.turnId === turn.turnId;
}

export function replaceMessageAt(
  messages: UIMessage[],
  index: number,
  message: UIMessage,
): UIMessage[] {
  const next = messages.slice();
  next[index] = message;
  return next;
}

function createActivitySegmentId(state: StreamFoldState, activate: boolean): string {
  state.activitySegmentCounter += 1;
  const id = `activity-${state.activitySegmentCounter}`;
  if (activate) state.activitySegmentId = id;
  return id;
}

export function ensureActivitySegmentId(state: StreamFoldState): string {
  return state.activitySegmentId ?? createActivitySegmentId(state, true);
}

export function detachedActivitySegmentId(state: StreamFoldState): string {
  return createActivitySegmentId(state, false);
}

export function clearActivitySegment(state: StreamFoldState): void {
  state.activitySegmentId = null;
  state.fileEditSegmentId = null;
}

export function closeActiveAssistantStream(state: StreamFoldState): boolean {
  const id = state.bufferMessageId ?? state.activeAssistant?.id;
  if (id) state.closedAssistantStreamIds.add(id);
  state.bufferMessageId = null;
  state.activeAssistant = null;
  return Boolean(id);
}
