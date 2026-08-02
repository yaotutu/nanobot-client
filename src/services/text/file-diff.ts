import type { UIFileDiff } from '@/types/api/chat';

export interface RenderableFileDiffLine {
  kind: 'context' | 'add' | 'delete';
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
  content: string;
}

export interface RenderableFileDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: RenderableFileDiffLine[];
}

export interface RenderableFileDiff {
  hunks: RenderableFileDiffHunk[];
}

const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

export function hasRenderableFileDiff(diff?: UIFileDiff): boolean {
  return typeof diff?.text === 'string' && diff.text.trim().length > 0;
}

export function parseRenderableFileDiff(diff: UIFileDiff): RenderableFileDiff {
  if (!hasRenderableFileDiff(diff)) return { hunks: [] };
  const hunks: RenderableFileDiffHunk[] = [];
  let current: RenderableFileDiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;

  for (const rawLine of (diff.text ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const header = HUNK_HEADER_RE.exec(rawLine);
    if (header) {
      current = {
        oldStart: Number(header[1]),
        oldLines: Number(header[2] ?? 1),
        newStart: Number(header[3]),
        newLines: Number(header[4] ?? 1),
        lines: [],
      };
      oldLineNumber = current.oldStart;
      newLineNumber = current.newStart;
      hunks.push(current);
      continue;
    }
    if (!current || rawLine.startsWith('\\')) continue;
    const marker = rawLine[0];
    const content = rawLine.slice(1);
    if (marker === '+') {
      current.lines.push({
        kind: 'add',
        oldLineNumber: null,
        newLineNumber,
        content,
      });
      newLineNumber += 1;
      continue;
    }
    if (marker === '-') {
      current.lines.push({
        kind: 'delete',
        oldLineNumber,
        newLineNumber: null,
        content,
      });
      oldLineNumber += 1;
      continue;
    }
    current.lines.push({
      kind: 'context',
      oldLineNumber,
      newLineNumber,
      content: marker === ' ' ? content : rawLine,
    });
    oldLineNumber += 1;
    newLineNumber += 1;
  }

  return { hunks };
}

export function countDiffLines(diff: RenderableFileDiff): number {
  return diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
}

export function countSkippedUnchangedLines(
  previous: RenderableFileDiffHunk,
  current: RenderableFileDiffHunk,
): number {
  const oldGap = current.oldStart - (previous.oldStart + previous.oldLines);
  const newGap = current.newStart - (previous.newStart + previous.newLines);
  return Math.max(0, oldGap, newGap);
}
