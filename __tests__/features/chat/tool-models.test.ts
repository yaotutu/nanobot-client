import { describe, expect, it } from 'vitest';

import {
  activityDurationMs,
  formatDuration,
  messageHasOnlyFileActivity,
  parseCliRunTrace,
  parseMcpRunTrace,
  summarizeFileEdits,
  toolEventStatesByTraceLine,
} from '@/features/chat/activity/model/tool-helpers';
import type { UIFileEdit, UIMessage } from '@/types/api/chat';

function edit(overrides: Partial<UIFileEdit> = {}): UIFileEdit {
  return {
    call_id: 'call-1',
    tool: 'edit_file',
    path: 'src/a.ts',
    added: 2,
    deleted: 1,
    status: 'editing',
    ...overrides,
  };
}

describe('command activity models', () => {
  it('parses CLI traces and preserves JSON/argument presentation data', () => {
    expect(parseCliRunTrace(
      'run_cli_app({"name":"gh","args":["issue","list"],"json":true})',
      'done',
    )).toMatchObject({
      name: 'gh',
      args: ['issue', 'list'],
      json: true,
      status: 'done',
    });
  });

  it('parses MCP preset and tool names', () => {
    expect(parseMcpRunTrace('mcp_github_create_issue({"title":"Bug"})', 'running'))
      .toMatchObject({
        presetName: 'github',
        displayName: 'GitHub',
        toolName: 'create_issue',
        status: 'running',
      });
  });

  it('keeps the terminal tool event state for duplicate trace lines', () => {
    const states = toolEventStatesByTraceLine([
      {
        phase: 'start',
        call_id: 'call-1',
        name: 'read_file',
        arguments: { path: 'src/a.ts' },
      },
      {
        phase: 'end',
        call_id: 'call-1',
        name: 'read_file',
        arguments: { path: 'src/a.ts' },
        result: 'ok',
      },
    ]);

    expect([...states.values()]).toEqual([
      expect.objectContaining({ status: 'done', result: 'ok' }),
    ]);
  });
});

describe('file activity models', () => {
  it('keeps the latest file edit for each call/path and resolves active status', () => {
    const summaries = summarizeFileEdits([
      edit(),
      edit({ status: 'done', added: 4, deleted: 3 }),
    ], false);

    expect(summaries).toEqual([
      expect.objectContaining({
        path: 'src/a.ts',
        status: 'done',
        added: 4,
        deleted: 3,
      }),
    ]);
  });

  it('recognizes messages containing only file activity', () => {
    const message: UIMessage = {
      id: 'trace-1',
      role: 'tool',
      kind: 'trace',
      content: 'edit_file({"path":"src/a.ts"})',
      traces: ['edit_file({"path":"src/a.ts"})'],
      fileEdits: [edit()],
      createdAt: 1,
    };
    expect(messageHasOnlyFileActivity(message)).toBe(true);
  });
});

describe('activity timing', () => {
  it('prefers completed server latency for inactive turns', () => {
    expect(activityDurationMs([], false, 10_000, 1234)).toBe(1234);
  });

  it('formats sub-second and minute durations', () => {
    expect(formatDuration(1)).toBe('1s');
    expect(formatDuration(60_000)).toBe('1m');
    expect(formatDuration(61_000)).toBe('1m 1s');
  });
});
