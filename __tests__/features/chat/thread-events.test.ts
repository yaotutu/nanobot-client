import { describe, expect, it } from 'vitest';
import { projectThreadEvents } from '@/features/chat/model/thread-events';
import { prependOlderMessages } from '@/features/chat/store/message-reconciliation';
import type { InboundEvent } from '@/types/api/chat/events';
import type { WebuiThreadPersistedPayload } from '@/types/api/chat/thread';

type Event = WebuiThreadPersistedPayload['events'][number];
const event = <T extends InboundEvent>(id: string, body: T): T & { projection_id: string; created_at_ms: number } => ({
  turn_id: 't1', ...body, projection_id: id, created_at_ms: body.created_at_ms ?? 1_780_000_000_000,
});
const thread = (events: Event[], rest: Partial<WebuiThreadPersistedPayload> = {}): WebuiThreadPersistedPayload => ({
  schemaVersion: 3, projection: 'events', sessionKey: 'websocket:c1',
  events, active_turn_id: null, has_pending_tool_calls: false, ...rest,
});
const user = event('u1', { event: 'user_message', chat_id: 'c1', text: 'Question', starts_turn: true });
const answer = event('a1', { event: 'stream_end', chat_id: 'c1', text: 'Answer' });
const end = event('e1', { event: 'turn_end', chat_id: 'c1', latency_ms: 200, created_at_ms: user.created_at_ms! + 200 });

describe('current event history projection', () => {
  it('replays full reasoning and answer endings without delta events', () => {
    const result = projectThreadEvents(thread([
      user,
      event('r1', { event: 'reasoning_end', chat_id: 'c1', text: 'Thinking', created_at_ms: user.created_at_ms! + 100 }),
      answer, end,
    ]));
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ id: 'user-u1', role: 'user', content: 'Question', createdAt: user.created_at_ms });
    expect(result.messages[1]).toMatchObject({
      id: 'reasoning-r1', role: 'assistant', content: 'Answer', reasoning: 'Thinking',
      isStreaming: false, reasoningStreaming: false, completedAt: end.created_at_ms, latencyMs: 200,
    });
  });

  it('uses canonical full text without duplicating streamed fragments', () => {
    const result = projectThreadEvents(thread([
      user,
      event('r0', { event: 'reasoning_delta', chat_id: 'c1', text: 'partial' }),
      event('r1', { event: 'reasoning_end', chat_id: 'c1', text: 'complete thought' }),
      event('a0', { event: 'delta', chat_id: 'c1', text: 'partial' }),
      answer, end,
    ]));
    expect(result.messages[1]).toMatchObject({ reasoning: 'complete thought', content: 'Answer' });
  });

  it('keeps replay identities stable across reload and overlapping pages', () => {
    const payload = thread([user, answer, end]);
    const first = projectThreadEvents(payload);
    expect(projectThreadEvents(payload)).toEqual(first);
    const older = projectThreadEvents(thread([
      event('u0', { event: 'user_message', chat_id: 'c1', text: 'Earlier', turn_id: 't0' }),
      event('a0', { event: 'message', chat_id: 'c1', text: 'Earlier answer', turn_id: 't0' }),
      user, answer, end,
    ]));
    expect(prependOlderMessages(first.messages, older.messages).map((message) => message.content))
      .toEqual(['Earlier', 'Earlier answer', 'Question', 'Answer']);
  });

  it('hides model command turns and converts event fork boundary to visible message count', () => {
    const payload = thread([
      event('cmd', { event: 'user_message', chat_id: 'c1', text: '/model test', turn_id: 'cmd' }),
      event('cmd-a', { event: 'message', chat_id: 'c1', text: 'Model changed', turn_id: 'cmd' }),
      event('cmd-e', { event: 'turn_end', chat_id: 'c1', turn_id: 'cmd' }),
      user, answer, end,
      event('u2', { event: 'user_message', chat_id: 'c1', text: 'Forked question', turn_id: 't2' }),
    ], { fork_boundary_event_index: 6, page: { before_cursor: 'cursor', has_more_before: true, user_message_offset: 7 } });
    const result = projectThreadEvents(payload);
    expect(result.messages.map((message) => message.content)).toEqual(['Question', 'Answer', 'Forked question']);
    expect(result.forkBoundaryMessageCount).toBe(2);
    expect(result.page).toEqual(payload.page);
    expect(projectThreadEvents(thread([], { fork_boundary_event_index: 0 })).forkBoundaryMessageCount).toBe(0);
  });

  it('preserves user file/video/image and context attachments plus assistant media', () => {
    const result = projectThreadEvents(thread([
      { ...user, media_urls: [
        { url: 'https://test.invalid/image.png' }, { url: 'https://test.invalid/video.mp4' },
        { url: 'https://test.invalid/report.pdf', name: 'report.pdf' },
      ], cli_apps: [{ name: 'shell' }], mcp_presets: [{ name: 'docs' }] },
      event('media', { event: 'message', chat_id: 'c1', text: 'File ready', media_urls: [{ url: 'https://test.invalid/output.pdf' }] }),
      end,
    ]));
    expect(result.messages[0].media?.map((media) => media.kind)).toEqual(['image', 'video', 'file']);
    expect(result.messages[0].cliApps).toEqual([{ name: 'shell' }]);
    expect(result.messages[0].mcpPresets).toEqual([{ name: 'docs' }]);
    expect(result.messages[1].media?.[0].kind).toBe('file');
  });

  it('merges tool and file-edit events and preserves authoritative active state', () => {
    const result = projectThreadEvents(thread([
      user,
      event('tool1', { event: 'message', chat_id: 'c1', text: '', kind: 'progress', tool_events: [{ call_id: 'read', name: 'read_file', phase: 'start' }] }),
      event('tool2', { event: 'message', chat_id: 'c1', text: '', kind: 'progress', tool_events: [{ call_id: 'read', name: 'read_file', phase: 'end', result: 'ok' }] }),
      event('file', { event: 'file_edit', chat_id: 'c1', edits: [{ call_id: 'edit', tool: 'edit_file', path: 'a.ts', added: 1, deleted: 0, status: 'editing' }] }),
    ], { active_turn_id: 't1', has_pending_tool_calls: true }));
    expect(result.messages.flatMap((message) => message.toolEvents ?? [])).toEqual([expect.objectContaining({ phase: 'end', call_id: 'read' })]);
    expect(result.messages.flatMap((message) => message.fileEdits ?? [])).toEqual([expect.objectContaining({ path: 'a.ts' })]);
    expect(result.active_turn_id).toBe('t1');
    expect(result.has_pending_tool_calls).toBe(true);
  });

  it('retains independent resumable streams and automation sources', () => {
    const result = projectThreadEvents(thread([
      user,
      event('a1', { event: 'stream_end', chat_id: 'c1', text: 'First', resuming: true, merge_next: true }),
      event('a2', { event: 'delta', chat_id: 'c1', text: ' continued' }),
      event('a3', { event: 'stream_end', chat_id: 'c1', text: 'First continued' }),
      event('a4', { event: 'stream_end', chat_id: 'c1', text: 'Notification', source: { kind: 'cron', label: 'Reminder' } }),
      end,
    ]));
    expect(result.messages.map((message) => message.content)).toEqual(['Question', 'First continued', 'Notification']);
    expect(result.messages[2].source).toEqual({ kind: 'cron', label: 'Reminder' });
  });
});
