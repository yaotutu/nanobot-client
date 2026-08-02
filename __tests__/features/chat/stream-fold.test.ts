import { describe, expect, it } from 'vitest';

import { createStreamFoldState, finalizeStreamedTurn, foldStreamEvent } from '@/features/chat/stream-fold';
import type { UIMessage } from '@/types/api/chat';

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

describe('foldStreamEvent', () => {
  it('ignores events without chat_id', () => {
    const state = createStreamFoldState();
    const result = foldStreamEvent([], { event: 'ready', chat_id: 'c1', client_id: 'x' }, state);
    expect(result).toEqual([]);
  });

  it('appends a delta event by creating a buffer message', () => {
    const state = createStreamFoldState();
    const result = foldStreamEvent(
      [],
      { event: 'delta', chat_id: 'c1', text: 'Hello', turn_id: 't1', turn_phase: 'answer' },
      state,
    );
    expect(result.length).toBe(1);
    expect(result[0].role).toBe('assistant');
    expect(result[0].content).toBe('Hello');
    expect(result[0].isStreaming).toBe(true);
  });

  it('appends subsequent delta to the existing buffer', () => {
    const state = createStreamFoldState();
    let msgs = foldStreamEvent(emptyMessages(), { event: 'delta', chat_id: 'c1', text: 'Hello', turn_id: 't1' }, state);
    msgs = foldStreamEvent(msgs, { event: 'delta', chat_id: 'c1', text: ' world', turn_id: 't1' }, state);
    expect(msgs.length).toBe(1);
    expect(msgs[0].content).toBe('Hello world');
  });

  it('switches turn when turn_id changes', () => {
    const state = createStreamFoldState();
    let msgs = foldStreamEvent(emptyMessages(), { event: 'delta', chat_id: 'c1', text: 'first', turn_id: 't1' }, state);
    msgs = foldStreamEvent(msgs, { event: 'delta', chat_id: 'c1', text: 'second', turn_id: 't2' }, state);
    expect(msgs.length).toBe(2);
  });
});

describe('finalizeStreamedTurn', () => {
  it('marks streaming=false on matching assistant messages', () => {
    const msgs = [assistantMessage({ id: 'a1', isStreaming: true, turnId: 't1', content: 'final' })];
    const result = finalizeStreamedTurn(msgs, { turnId: 't1' });
    expect(result[0].isStreaming).toBe(false);
  });

  it('leaves other turns untouched', () => {
    const msgs = [
      assistantMessage({ id: 'a1', isStreaming: true, turnId: 't1', content: 'A' }),
      assistantMessage({ id: 'a2', isStreaming: true, turnId: 't2', content: 'B' }),
    ];
    const result = finalizeStreamedTurn(msgs, { turnId: 't1' });
    expect(result[0].isStreaming).toBe(false);
    expect(result[1].isStreaming).toBe(true);
  });
});
