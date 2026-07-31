import { toMediaAttachment } from '@/lib/media';
import {
  formatToolCallTrace,
  mergeToolProgressEvents,
  mergeUniqueToolTraceLines,
  normalizeToolProgressEvents,
  toolTraceLinesFromEvents,
  canonicalToolTrace,
} from '@/lib/tool-traces';
import type { InboundEvent, ToolProgressEvent, UIFileEdit, UIMessage } from '@/types/nanobot';

export const STREAM_END_IDLE_DELAY_MS = 1_000;

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

const FILE_EDIT_TOOL_NAMES = new Set(['write_file', 'edit_file', 'apply_patch']);

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

function nextMessageId(state: StreamFoldState, prefix: string, turnId?: string): string {
  state.messageCounter += 1;
  return `${prefix}-${turnId ?? 'legacy'}-${Date.now()}-${state.messageCounter}`;
}

function turnFields(event: InboundEvent, fallback?: UIMessage['turnPhase']): StreamTurnFields {
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

function matchesTurn(message: UIMessage, turn: StreamTurnFields = {}): boolean {
  return !turn.turnId || !message.turnId || message.turnId === turn.turnId;
}

function replaceMessageAt(messages: UIMessage[], index: number, message: UIMessage): UIMessage[] {
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

function ensureActivitySegmentId(state: StreamFoldState): string {
  return state.activitySegmentId ?? createActivitySegmentId(state, true);
}

function detachedActivitySegmentId(state: StreamFoldState): string {
  return createActivitySegmentId(state, false);
}

function clearActivitySegment(state: StreamFoldState): void {
  state.activitySegmentId = null;
  state.fileEditSegmentId = null;
}

function closeActiveAssistantStream(state: StreamFoldState): boolean {
  const id = state.bufferMessageId ?? state.activeAssistant?.id;
  if (id) state.closedAssistantStreamIds.add(id);
  state.bufferMessageId = null;
  state.activeAssistant = null;
  return Boolean(id);
}

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

function closeReasoningStream(messages: UIMessage[]): UIMessage[] {
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

function attachReasoningChunk(
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

function appendAnswerChunk(
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

function applyStreamEnd(
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

function pruneReasoningOnlyPlaceholders(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message, index) => {
    if (!isReasoningOnlyPlaceholder(message)) return true;
    return messages[index + 1]?.kind === 'trace';
  });
}

function stampLastAssistantCompletion(
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

function canonicalFileEditToolName(name: string): string {
  return (name.toLowerCase().split(/[.:/]/).pop() ?? name.toLowerCase()).trim();
}

function toolEventName(event: { name?: unknown; function?: { name?: unknown } }): string {
  if (typeof event.function?.name === 'string') return event.function.name;
  return typeof event.name === 'string' ? event.name : '';
}

function fileEditKey(edit: Pick<UIFileEdit, 'call_id' | 'tool' | 'path'>): string {
  const tool = canonicalFileEditToolName(edit.tool);
  if (edit.call_id && edit.path) return `${edit.call_id}|${tool}|${edit.path}`;
  if (edit.call_id) return `${edit.call_id}|${tool}`;
  return `${tool}|${edit.path}`;
}

function fileEditToolEventKey(edit: Pick<UIFileEdit, 'call_id' | 'tool'>): string {
  return `${edit.call_id}|${canonicalFileEditToolName(edit.tool)}`;
}

function toolEventFileEditKey(event: ToolProgressEvent): string | null {
  const name = canonicalFileEditToolName(toolEventName(event));
  const callId = typeof event.call_id === 'string' ? event.call_id : '';
  if (!name || !callId || !FILE_EDIT_TOOL_NAMES.has(name)) return null;
  return `${callId}|${name}`;
}

function fileEditMatchesToolEvent(edit: UIFileEdit, event: ToolProgressEvent): boolean {
  const key = toolEventFileEditKey(event);
  if (!key) return false;
  if (edit.call_id) return fileEditToolEventKey(edit) === key;
  return canonicalFileEditToolName(edit.tool) === canonicalFileEditToolName(toolEventName(event));
}

function normalizeFileEdit(edit: UIFileEdit): UIFileEdit | null {
  if (!edit || !edit.tool || (!edit.path && !edit.pending)) return null;
  const inferredStatus = edit.phase === 'error' ? 'error' : edit.phase === 'end' ? 'done' : 'editing';
  const normalized: UIFileEdit = {
    ...edit,
    call_id: edit.call_id || `${edit.tool}:${edit.path}`,
    added: Number.isFinite(edit.added) ? Math.max(0, Math.round(edit.added)) : 0,
    deleted: Number.isFinite(edit.deleted) ? Math.max(0, Math.round(edit.deleted)) : 0,
    status: ['editing', 'done', 'error'].includes(edit.status) ? edit.status : inferredStatus,
  };
  if (edit.pending && !edit.path) normalized.pending = true;
  return normalized;
}

function mergeFileEdits(existing: UIFileEdit[] | undefined, incoming: UIFileEdit[]): UIFileEdit[] {
  const next = [...(existing ?? [])];
  const indexByKey = new Map(next.map((edit, index) => [fileEditKey(edit), index]));
  for (const raw of incoming) {
    const edit = normalizeFileEdit(raw);
    if (!edit) continue;
    const key = fileEditKey(edit);
    let existingIndex = indexByKey.get(key);
    if (existingIndex === undefined && edit.path) {
      const eventKey = fileEditToolEventKey(edit);
      const pendingIndex = next.findIndex((candidate) =>
        !candidate.path && candidate.pending && fileEditToolEventKey(candidate) === eventKey,
      );
      if (pendingIndex >= 0) existingIndex = pendingIndex;
    }
    if (existingIndex === undefined) {
      indexByKey.set(key, next.length);
      next.push(edit);
    } else {
      const merged = { ...next[existingIndex], ...edit };
      if (edit.path && !edit.pending) delete merged.pending;
      next[existingIndex] = merged;
      indexByKey.set(key, existingIndex);
    }
  }
  return next;
}

function traceLines(message: UIMessage): string[] {
  return message.traces?.length ? message.traces : message.content.trim() ? [message.content] : [];
}

function filterCoveredFileEditToolEvents(messages: UIMessage[], events: ToolProgressEvent[]): ToolProgressEvent[] {
  const edits = messages.flatMap((message) => message.fileEdits ?? []);
  return events.filter((event) => !edits.some((edit) => fileEditMatchesToolEvent(edit, event)));
}

function stripCoveredFileEditToolHints(messages: UIMessage[], edits: UIFileEdit[]): UIMessage[] {
  if (!edits.length) return messages;
  const next = [...messages];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (message.role === 'user') break;
    if (message.kind !== 'trace') continue;
    const keptEvents = (message.toolEvents ?? []).filter(
      (event) => !edits.some((edit) => fileEditMatchesToolEvent(edit, event)),
    );
    if (keptEvents.length === (message.toolEvents ?? []).length) continue;
    const removedLines = new Set(
      (message.toolEvents ?? [])
        .filter((event) => edits.some((edit) => fileEditMatchesToolEvent(edit, event)))
        .map((event) => formatToolCallTrace(event))
        .filter((line): line is string => Boolean(line))
        .map(canonicalToolTrace),
    );
    const keptLines = traceLines(message).filter((line) => !removedLines.has(canonicalToolTrace(line)));
    if (!keptEvents.length && !keptLines.length && !message.fileEdits?.length) {
      next.splice(index, 1);
    } else {
      next[index] = {
        ...message,
        content: keptLines[keptLines.length - 1] ?? '',
        traces: keptLines,
        toolEvents: keptEvents.length ? keptEvents : undefined,
      };
    }
  }
  return next;
}

function mergeActivityTrace(
  messages: UIMessage[],
  event: Extract<InboundEvent, { event: 'message' }>,
  state: StreamFoldState,
): UIMessage[] {
  closeActiveAssistantStream(state);
  const rawEvents = normalizeToolProgressEvents(event.tool_events);
  const structuredEvents = filterCoveredFileEditToolEvents(messages, rawEvents);
  const structuredLines = toolTraceLinesFromEvents(structuredEvents);
  const lines = structuredLines.length ? structuredLines : rawEvents.length ? [] : event.text ? [event.text] : [];
  if (!lines.length && !structuredEvents.length) return messages;
  const segmentId = ensureActivitySegmentId(state);
  const last = messages[messages.length - 1];
  if (
    last?.kind === 'trace' &&
    !last.isStreaming &&
    (!last.activitySegmentId || last.activitySegmentId === segmentId)
  ) {
    const mergedLines = structuredEvents.length
      ? mergeUniqueToolTraceLines(traceLines(last), structuredLines).traces
      : [...traceLines(last), ...lines];
    return replaceMessageAt(messages, messages.length - 1, {
      ...last,
      content: mergedLines[mergedLines.length - 1] ?? '',
      traces: mergedLines,
      toolEvents: structuredEvents.length
        ? mergeToolProgressEvents(last.toolEvents, structuredEvents)
        : last.toolEvents,
      activitySegmentId: last.activitySegmentId ?? segmentId,
      ...turnFields(event, 'activity'),
    });
  }
  return [...messages, {
    id: nextMessageId(state, 'trace', 'turn_id' in event ? event.turn_id : undefined),
    role: 'tool',
    kind: 'trace',
    content: lines[lines.length - 1] ?? '',
    traces: lines,
    ...(structuredEvents.length ? { toolEvents: structuredEvents } : {}),
    activitySegmentId: segmentId,
    ...turnFields(event, 'activity'),
    createdAt: Date.now(),
  }];
}

function findFileEditTraceIndex(
  messages: UIMessage[],
  segmentId: string | null,
  incoming: UIFileEdit[],
): number | null {
  const incomingKeys = new Set(incoming.map(fileEditKey));
  const incomingToolKeys = new Set(incoming.map(fileEditToolEventKey));
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role === 'user') break;
    if (candidate.kind !== 'trace') continue;
    if (segmentId && candidate.activitySegmentId === segmentId) return index;
    if ((candidate.fileEdits ?? []).some((edit) =>
      incomingKeys.has(fileEditKey(edit)) ||
      (!edit.path && edit.pending && incomingToolKeys.has(fileEditToolEventKey(edit))),
    )) return index;
  }
  return null;
}

function mergeFileEditTrace(
  messages: UIMessage[],
  event: Extract<InboundEvent, { event: 'file_edit' }>,
  state: StreamFoldState,
): UIMessage[] {
  closeActiveAssistantStream(state);
  const normalized = mergeFileEdits(undefined, Array.isArray(event.edits) ? event.edits : []);
  if (!normalized.length) return messages;
  const opensFileEditPhase = normalized.some((edit) => edit.status === 'editing' || edit.phase === 'start');
  let segmentId = state.fileEditSegmentId;
  if (!segmentId && opensFileEditPhase) {
    segmentId = detachedActivitySegmentId(state);
    state.fileEditSegmentId = segmentId;
  }
  const base = stripCoveredFileEditToolHints(messages, normalized);
  const targetIndex = findFileEditTraceIndex(base, segmentId, normalized);
  if (targetIndex !== null) {
    const target = base[targetIndex];
    segmentId = target.activitySegmentId ?? segmentId ?? detachedActivitySegmentId(state);
    if (opensFileEditPhase) state.fileEditSegmentId = segmentId;
    return replaceMessageAt(base, targetIndex, {
      ...target,
      fileEdits: mergeFileEdits(target.fileEdits, normalized),
      activitySegmentId: segmentId,
      ...turnFields(event, 'activity'),
    });
  }
  segmentId ??= detachedActivitySegmentId(state);
  if (opensFileEditPhase) state.fileEditSegmentId = segmentId;
  return [...base, {
    id: nextMessageId(state, 'file-edit', event.turn_id),
    role: 'tool',
    kind: 'trace',
    content: '',
    traces: [],
    fileEdits: normalized,
    activitySegmentId: segmentId,
    ...turnFields(event, 'activity'),
    createdAt: Date.now(),
  }];
}

function completeAssistantMessage(
  messages: UIMessage[],
  event: Extract<InboundEvent, { event: 'message' }>,
  state: StreamFoldState,
): UIMessage[] {
  clearActivitySegment(state);
  const activeId = state.bufferMessageId;
  state.bufferMessageId = null;
  state.activeAssistant = null;
  const filtered = activeId ? messages.filter((message) => message.id !== activeId) : messages;
  const mediaRows = event.media_urls?.length
    ? event.media_urls.map((media) => toMediaAttachment(media))
    : event.media?.map((url) => toMediaAttachment({ url }));
  const media = mediaRows?.length ? mediaRows : undefined;
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
  const mediaRows = event.media_urls?.length
    ? event.media_urls.map((media) => toMediaAttachment(media))
    : event.media?.map((url) => toMediaAttachment({ url }));
  const media = mediaRows?.length ? mediaRows : undefined;
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
  if (event.event === 'delta') return event.text ? appendAnswerChunk(messages, event.text, state, turnFields(event, 'answer')) : messages;
  if (event.event === 'reasoning_delta') {
    if (state.fileEditSegmentId) clearActivitySegment(state);
    return event.text ? attachReasoningChunk(messages, event.text, state, turnFields(event, 'reasoning')) : messages;
  }
  if (event.event === 'stream_end') return applyStreamEnd(messages, event, state);
  if (event.event === 'reasoning_end') return closeReasoningStream(messages);
  if (event.event === 'file_edit') return mergeFileEditTrace(messages, event, state);
  if (event.event === 'message' && event.kind === 'reasoning') {
    if (state.fileEditSegmentId) clearActivitySegment(state);
    return closeReasoningStream(attachReasoningChunk(messages, event.text, state, turnFields(event, 'reasoning')));
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

export function streamEventTurn(event: InboundEvent, fallback?: UIMessage['turnPhase']): StreamTurnFields {
  return turnFields(event, fallback);
}

export function eventExtendsModelActivity(event: InboundEvent): boolean {
  if (event.event === 'delta' || event.event === 'reasoning_delta' || event.event === 'file_edit') return true;
  return event.event === 'message' &&
    (event.kind === 'tool_hint' || event.kind === 'progress' || event.kind === 'reasoning');
}
