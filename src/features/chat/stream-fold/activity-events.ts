import {
  canonicalToolTrace,
  formatToolCallTrace,
  mergeToolProgressEvents,
  mergeUniqueToolTraceLines,
  normalizeToolProgressEvents,
  toolTraceLinesFromEvents,
} from '@/features/chat/tool-traces';
import type {
  InboundEvent,
  ToolProgressEvent,
  UIFileEdit,
  UIMessage,
} from '@/types/api/chat';

import {
  closeActiveAssistantStream,
  detachedActivitySegmentId,
  ensureActivitySegmentId,
  nextMessageId,
  replaceMessageAt,
  turnFields,
  type StreamFoldState,
} from './state';

const FILE_EDIT_TOOL_NAMES = new Set(['write_file', 'edit_file', 'apply_patch']);

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

function filterCoveredFileEditToolEvents(
  messages: UIMessage[],
  events: ToolProgressEvent[],
): ToolProgressEvent[] {
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

export function mergeActivityTrace(
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

export function mergeFileEditTrace(
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
