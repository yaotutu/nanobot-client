import { describe, expect, it } from 'vitest';

import {
  canGroupGenericToolRuns,
  describeGenericToolRun,
  parseGenericToolTrace,
  type GenericToolRunItem,
} from '@/features/chat/generic-tool-model';

function run(line: string, status: GenericToolRunItem['status']): GenericToolRunItem {
  const trace = parseGenericToolTrace(line);
  if (!trace) throw new Error(`Expected generic trace for ${line}`);
  return { trace, status };
}

describe('generic tool parser', () => {
  it('classifies search, list, read, memory, and fallback tool families', () => {
    expect(parseGenericToolTrace('rg({"query":"needle"})')?.family).toBe('content-search');
    expect(parseGenericToolTrace('glob({"glob":"**/*.ts"})')?.family).toBe('file-search');
    expect(parseGenericToolTrace('list_dir({"path":"src"})')?.family).toBe('list');
    expect(parseGenericToolTrace('read_file({"path":"src/a.ts"})')?.family).toBe('read');
    expect(parseGenericToolTrace('memory_search({"query":"decision"})')?.family).toBe('memory');
    expect(parseGenericToolTrace('custom_action({"label":"work"})')?.family).toBe('generic');
  });

  it('normalizes qualified names and ignores specialized tool renderers', () => {
    expect(parseGenericToolTrace('namespace.READ_FILE({"path":"a"})')?.name).toBe('read_file');
    expect(parseGenericToolTrace('mcp_github_issue({})')).toBeNull();
    expect(parseGenericToolTrace('apply_patch({})')).toBeNull();
    expect(parseGenericToolTrace('not a call')).toBeNull();
  });

  it('marks collected source paths and groups them separately', () => {
    const collected = run(
      'read_file({"path":"/tmp/.nanobot/tool-results/source.md"})',
      'done',
    );
    const workspace = run('read_file({"path":"src/source.ts"})', 'done');

    expect(collected.trace.collectedSource).toBe(true);
    expect(canGroupGenericToolRuns(collected, workspace)).toBe(false);
  });

  it('groups adjacent runs by family and source scope', () => {
    const first = run('rg({"query":"one"})', 'running');
    const second = run('grep({"pattern":"two"})', 'done');
    expect(canGroupGenericToolRuns(first, second)).toBe(true);
  });
});

describe('generic tool presentation', () => {
  it('aggregates error status and reports grouped search count', () => {
    const presentation = describeGenericToolRun([
      run('rg({"query":"one"})', 'done'),
      run('grep({"pattern":"two"})', 'error'),
    ]);

    expect(presentation.status).toBe('error');
    expect(presentation.label).toBeTruthy();
    expect(presentation.aside).toContain('search');
  });

  it('redacts and compacts a single file path for display', () => {
    const presentation = describeGenericToolRun([
      run('read_file({"path":"/Users/example/project/src/feature.ts"})', 'done'),
    ]);

    expect(presentation.detail).toContain('src/feature.ts');
    expect(presentation.detail).not.toContain('/Users/example');
  });
});
