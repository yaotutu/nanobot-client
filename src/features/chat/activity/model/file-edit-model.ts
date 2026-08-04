import {
  countSkippedUnchangedLines,
  type RenderableFileDiff,
  type RenderableFileDiffHunk,
} from '@/services/text/file-diff';
import type {
  UIFileEdit,
  UIMessage,
} from '@/types/api/chat/messages';

import { traceLines } from './activity-format';
import type { FileEditSummary, VisibleDiffHunk } from './tool-types';

const fileDiffObjectIds = new WeakMap<object, number>();
let nextFileDiffObjectId = 1;

export function fileDiffObjectId(diff: UIFileEdit['diff']): number {
  if (!diff) return 0;
  const existing = fileDiffObjectIds.get(diff);
  if (existing) return existing;
  const id = nextFileDiffObjectId;
  nextFileDiffObjectId += 1;
  fileDiffObjectIds.set(diff, id);
  return id;
}

export function fileDiffRevision(diff: UIFileEdit['diff']): string {
  if (!diff) return 'none';
  const text = diff.text ?? '';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${fileDiffObjectId(diff)}:${text.length}:${hash >>> 0}:${diff.truncated ? 1 : 0}`;
}

export function selectVisibleDiffLines(
  diff: RenderableFileDiff,
  lineLimit: number,
): VisibleDiffHunk[] {
  let remaining = Math.max(0, lineLimit);
  const visible: VisibleDiffHunk[] = [];
  let previous: RenderableFileDiffHunk | null = null;
  for (const hunk of diff.hunks) {
    if (remaining <= 0) break;
    const skippedBefore = previous ? countSkippedUnchangedLines(previous, hunk) : 0;
    const lines = hunk.lines.slice(0, remaining);
    visible.push({ hunk: { ...hunk, lines }, skippedBefore });
    remaining -= lines.length;
    previous = hunk;
  }
  return visible;
}

export function collectFileEdits(messages: UIMessage[]): UIFileEdit[] {
  const edits: UIFileEdit[] = [];
  for (const message of messages) {
    if (message.kind === 'trace' && message.fileEdits?.length) edits.push(...message.fileEdits);
  }
  return edits;
}

function fileEditCallKey(edit: UIFileEdit): string {
  if (edit.call_id && edit.path) return `${edit.call_id}|${edit.tool}|${edit.path}`;
  if (edit.call_id) return `${edit.call_id}|${edit.tool}`;
  return `${edit.tool}|${edit.path}`;
}

function latestFileEditEvents(edits: UIFileEdit[]): UIFileEdit[] {
  const order: string[] = [];
  const byKey = new Map<string, UIFileEdit>();
  for (const edit of edits) {
    const key = fileEditCallKey(edit);
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, edit);
  }
  return order.flatMap((key) => {
    const edit = byKey.get(key);
    return edit ? [edit] : [];
  });
}

export function summarizeFileEdits(
  edits: UIFileEdit[],
  active: boolean,
): FileEditSummary[] {
  return latestFileEditEvents(edits).flatMap((edit) => {
    const editing = active && edit.status === 'editing';
    const failed = edit.status === 'error';
    if (!edit.path && edit.pending && !editing) return [];
    if (!edit.path && !editing && !failed) return [];

    const binary = Boolean(edit.binary);
    return [{
      key: fileEditCallKey(edit),
      path: edit.path || '',
      absolutePath: edit.absolute_path,
      added: binary ? 0 : edit.added,
      deleted: binary ? 0 : edit.deleted,
      approximate: active && Boolean(edit.approximate),
      binary,
      status: editing ? 'editing' : failed ? 'error' : 'done',
      operation: edit.operation,
      pending: Boolean(edit.pending) && !edit.path,
      error: edit.error,
      diff: edit.diff,
    }];
  });
}

function isFileEditTraceLine(line: string): boolean {
  return /^(write_file|edit_file|apply_patch)\(/.test(line.trim());
}

export function messageHasOnlyFileActivity(message: UIMessage): boolean {
  if (message.kind !== 'trace' || !message.fileEdits?.length) return false;
  return traceLines(message).every((line) => !line.trim() || isFileEditTraceLine(line));
}
