import { describe, expect, it } from 'vitest';

import { countDiffLines, parseRenderableFileDiff } from '@/services/text/file-diff';
import type { UIFileDiff } from '@/types/api';

const sampleDiff: UIFileDiff = {
  format: 'unified',
  text: [
    'diff --git a/foo.txt b/foo.txt',
    '--- a/foo.txt',
    '+++ b/foo.txt',
    '@@ -1,3 +1,3 @@',
    '-old line 1',
    '-old line 2',
    ' context line',
    '+new line 1',
    '+new line 2',
    '+new line 3',
  ].join('\n'),
};

describe('parseRenderableFileDiff', () => {
  it('parses a unified diff with one hunk', () => {
    const out = parseRenderableFileDiff(sampleDiff);
    expect(out.hunks.length).toBe(1);
    const hunk = out.hunks[0];
    expect(hunk.oldStart).toBe(1);
    expect(hunk.newStart).toBe(1);
    const adds = hunk.lines.filter((l) => l.kind === 'add').length;
    const dels = hunk.lines.filter((l) => l.kind === 'delete').length;
    const ctxs = hunk.lines.filter((l) => l.kind === 'context').length;
    expect(adds).toBe(3);
    expect(dels).toBe(2);
    expect(ctxs).toBe(1);
  });

  it('returns empty hunks for empty diff', () => {
    const out = parseRenderableFileDiff({ format: 'unified', text: '' });
    expect(out.hunks.length).toBe(0);
  });
});

describe('countDiffLines', () => {
  it('returns total line count', () => {
    expect(countDiffLines(parseRenderableFileDiff(sampleDiff))).toBe(6); // 2 delete + 1 context + 3 add
  });
});
