import { describe, expect, it, vi } from 'vitest';

import {
  createStreamFoldState,
  finalizeStreamedTurn,
  foldStreamEvent,
} from '@/features/chat/stream-fold';
import type { UIFileEdit, UIMessage } from '@/types/api/chat';

function emptyMessages(): UIMessage[] {
  return [];
}

function assistantMessage(overrides: Partial<UIMessage> = {}): UIMessage {
  return {
    id: 'a-1',
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    isStreaming: false,
    ...overrides,
  };
}

function fileEdit(overrides: Partial<UIFileEdit> = {}): UIFileEdit {
  return {
    call_id: 'call-1',
    tool: 'edit_file',
    path: 'src/example.ts',
    added: 1,
    deleted: 0,
    status: 'editing',
    ...overrides,
  };
}

describe('foldStreamEvent', () => {
  it('ignores non-stream lifecycle events', () => {
    const state = createStreamFoldState();
    const messages = emptyMessages();
    const result = foldStreamEvent(
      messages,
      { event: 'ready', chat_id: 'c1', client_id: 'x' },
      state,
    );
    expect(result).toBe(messages);
  });

  it('appends a delta event by creating a buffer message', () => {
    const state = createStreamFoldState();
    const result = foldStreamEvent(
      [],
      { event: 'delta', chat_id: 'c1', text: 'Hello', turn_id: 't1', turn_phase: 'answer' },
      state,
    );
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({
      role: 'assistant',
      content: 'Hello',
      isStreaming: true,
      turnId: 't1',
      turnPhase: 'answer',
    });
  });

  it('appends subsequent delta to the existing buffer', () => {
    const state = createStreamFoldState();
    let messages = foldStreamEvent(
      emptyMessages(),
      { event: 'delta', chat_id: 'c1', text: 'Hello', turn_id: 't1' },
      state,
    );
    messages = foldStreamEvent(
      messages,
      { event: 'delta', chat_id: 'c1', text: ' world', turn_id: 't1' },
      state,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello world');
  });

  it('starts a separate assistant message when turn_id changes', () => {
    const state = createStreamFoldState();
    let messages = foldStreamEvent(
      emptyMessages(),
      { event: 'delta', chat_id: 'c1', text: 'first', turn_id: 't1' },
      state,
    );
    messages = foldStreamEvent(
      messages,
      { event: 'delta', chat_id: 'c1', text: 'second', turn_id: 't2' },
      state,
    );
    expect(messages.map((message) => message.content)).toEqual(['first', 'second']);
  });

  it('replaces partial content with the canonical completed message', () => {
    const state = createStreamFoldState();
    let messages = foldStreamEvent(
      [],
      { event: 'delta', chat_id: 'c1', text: 'Part', turn_id: 't1' },
      state,
    );
    messages = foldStreamEvent(
      messages,
      {
        event: 'message',
        chat_id: 'c1',
        text: 'Canonical answer',
        turn_id: 't1',
        latency_ms: 124.6,
      },
      state,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      content: 'Canonical answer',
      latencyMs: 125,
      turnId: 't1',
      turnPhase: 'answer',
    });
    expect(messages[0].isStreaming).toBeUndefined();
  });

  it('keeps a resumable stream open and merges the next delta', () => {
    const state = createStreamFoldState();
    let messages = foldStreamEvent(
      [],
      { event: 'delta', chat_id: 'c1', text: 'draft', turn_id: 't1' },
      state,
    );
    const id = messages[0].id;
    messages = foldStreamEvent(
      messages,
      {
        event: 'stream_end',
        chat_id: 'c1',
        text: 'canonical',
        resuming: true,
        merge_next: true,
        turn_id: 't1',
      },
      state,
    );
    messages = foldStreamEvent(
      messages,
      { event: 'delta', chat_id: 'c1', text: ' continuation', turn_id: 't1' },
      state,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ id, content: 'canonical continuation' });
  });

  it('does not append a late delta to a closed stream', () => {
    const state = createStreamFoldState();
    let messages = foldStreamEvent(
      [],
      { event: 'delta', chat_id: 'c1', text: 'first', turn_id: 't1' },
      state,
    );
    messages = foldStreamEvent(
      messages,
      { event: 'stream_end', chat_id: 'c1', turn_id: 't1' },
      state,
    );
    messages = foldStreamEvent(
      messages,
      { event: 'delta', chat_id: 'c1', text: 'late', turn_id: 't1' },
      state,
    );

    expect(messages.map((message) => message.content)).toEqual(['first', 'late']);
  });

  it('folds tool start and end events into one activity trace', () => {
    const state = createStreamFoldState();
    const start = {
      phase: 'start' as const,
      call_id: 'tool-1',
      name: 'read_file',
      arguments: { path: 'src/a.ts' },
    };
    const end = {
      ...start,
      phase: 'end' as const,
      result: { ok: true },
    };
    let messages = foldStreamEvent(
      [],
      {
        event: 'message',
        kind: 'progress',
        chat_id: 'c1',
        text: '',
        tool_events: [start],
        turn_id: 't1',
      },
      state,
    );
    messages = foldStreamEvent(
      messages,
      {
        event: 'message',
        kind: 'progress',
        chat_id: 'c1',
        text: '',
        tool_events: [end],
        turn_id: 't1',
      },
      state,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: 'trace', turnPhase: 'activity' });
    expect(messages[0].toolEvents).toHaveLength(1);
    expect(messages[0].toolEvents?.[0]).toMatchObject({ phase: 'end', call_id: 'tool-1' });
  });

  it('reconciles pending file edit events with their completed path', () => {
    const state = createStreamFoldState();
    let messages = foldStreamEvent(
      [],
      {
        event: 'file_edit',
        chat_id: 'c1',
        turn_id: 't1',
        edits: [fileEdit({ path: '', pending: true, phase: 'start' })],
      },
      state,
    );
    messages = foldStreamEvent(
      messages,
      {
        event: 'file_edit',
        chat_id: 'c1',
        turn_id: 't1',
        edits: [fileEdit({ phase: 'end', status: 'done', added: 3, deleted: 2 })],
      },
      state,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].fileEdits).toEqual([
      expect.objectContaining({
        path: 'src/example.ts',
        status: 'done',
        added: 3,
        deleted: 2,
      }),
    ]);
    expect(messages[0].fileEdits?.[0].pending).toBeUndefined();
  });

  it('suppresses duplicate stream payloads after a media completion until turn_end', () => {
    const state = createStreamFoldState();
    let messages = foldStreamEvent(
      [],
      {
        event: 'message',
        chat_id: 'c1',
        text: 'image',
        media: ['https://example.com/image.png'],
        turn_id: 't1',
      },
      state,
    );
    const afterMessage = messages;
    messages = foldStreamEvent(
      messages,
      { event: 'delta', chat_id: 'c1', text: 'duplicate', turn_id: 't1' },
      state,
    );
    expect(messages).toBe(afterMessage);

    messages = foldStreamEvent(
      messages,
      { event: 'turn_end', chat_id: 'c1', turn_id: 't1' },
      state,
    );
    messages = foldStreamEvent(
      messages,
      { event: 'delta', chat_id: 'c1', text: 'next', turn_id: 't2' },
      state,
    );
    expect(messages.at(-1)?.content).toBe('next');
  });

  it('prunes a reasoning-only placeholder at turn completion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));
    const state = createStreamFoldState();
    let messages = foldStreamEvent(
      [],
      { event: 'reasoning_delta', chat_id: 'c1', text: 'thinking', turn_id: 't1' },
      state,
    );
    messages = foldStreamEvent(
      messages,
      { event: 'reasoning_end', chat_id: 'c1', turn_id: 't1' },
      state,
    );
    messages = foldStreamEvent(
      messages,
      { event: 'turn_end', chat_id: 'c1', turn_id: 't1' },
      state,
    );

    expect(messages).toEqual([]);
    vi.useRealTimers();
  });
});

describe('finalizeStreamedTurn', () => {
  it('marks streaming=false on matching assistant messages', () => {
    const messages = [
      assistantMessage({ id: 'a1', isStreaming: true, turnId: 't1', content: 'final' }),
    ];
    const result = finalizeStreamedTurn(messages, { turnId: 't1' });
    expect(result[0].isStreaming).toBe(false);
  });

  it('leaves other turns untouched', () => {
    const messages = [
      assistantMessage({ id: 'a1', isStreaming: true, turnId: 't1', content: 'A' }),
      assistantMessage({ id: 'a2', isStreaming: true, turnId: 't2', content: 'B' }),
    ];
    const result = finalizeStreamedTurn(messages, { turnId: 't1' });
    expect(result[0].isStreaming).toBe(false);
    expect(result[1].isStreaming).toBe(true);
  });
});
