import { describe, expect, it } from 'vitest';

import { MockWebSocket, findSentFrame, makeSocket, setupSocketTestEnvironment } from './socket-test-fixture';

describe('socket transport inbound', () => {
  setupSocketTestEnvironment();

  // ---- inbound event routing ----

  it('emits generic events via onEvent', () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const events: unknown[] = [];
    socket.onEvent((e) => events.push(e));

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({ event: 'delta', chat_id: 'c1', turn_id: 't1', content: 'hi' }),
    );

    expect(events).toHaveLength(1);
    expect((events[0] as { event: string }).event).toBe('delta');
  });

  it('resolves transcription_result events', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.transcribeAudio('data:audio/wav;base64,AAA', {
      timeoutMs: 5_000,
    });

    // Find the transcribe frame to get the request_id
    const frame = findSentFrame('transcribe_audio');
    const requestId = frame!.request_id as string;

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'transcription_result',
        request_id: requestId,
        text: 'hello world',
      }),
    );

    await expect(promise).resolves.toBe('hello world');
  });

  it('rejects transcription on transcription_error', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.transcribeAudio('data:audio/wav;base64,AAA');
    const frame = findSentFrame('transcribe_audio');
    const requestId = frame!.request_id as string;

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'transcription_error',
        request_id: requestId,
        detail: 'audio too short',
      }),
    );

    await expect(promise).rejects.toThrow('audio too short');
  });

  it('redirects system command turns (not emitted via onEvent)', () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const events: unknown[] = [];
    socket.onEvent((e) => events.push(e));

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'message',
        chat_id: 'c1',
        turn_id: 'webui-system:abc-123',
        content: 'done',
      }),
    );

    expect(events).toHaveLength(0);
  });

  it('fires onRunStatus for goal_status events', () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const runStatuses: Array<{ chatId: string; startedAt: number | null }> = [];
    socket.onRunStatus((chatId, startedAt) =>
      runStatuses.push({ chatId, startedAt }),
    );
    runStatuses.length = 0; // clear initial replay

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'goal_status',
        chat_id: 'c1',
        status: 'running',
        started_at: 12345,
      }),
    );

    expect(runStatuses).toEqual([{ chatId: 'c1', startedAt: 12345 }]);

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'goal_status',
        chat_id: 'c1',
        status: 'idle',
      }),
    );

    expect(runStatuses[1]).toEqual({ chatId: 'c1', startedAt: null });
  });

  it('resolves normal message sends from goal_status running when message_accepted is omitted', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const result = socket.sendMessage('c1', 'hello');

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'goal_status',
        chat_id: 'c1',
        status: 'running',
        started_at: 12345,
      }),
    );

    await expect(result.accepted).resolves.toBeUndefined();
  });

  it('resolves queued sends from the first turn event when no acceptance frame exists', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const result = socket.sendMessage('c1', 'hello', undefined, { startsNewRun: false });

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'delta',
        chat_id: 'c1',
        text: 'ok',
      }),
    );

    await expect(result.accepted).resolves.toBeUndefined();
  });

  it('does not emit onRunStatus for idle on unknown chat', () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    let emitted = false;
    socket.onRunStatus(() => {
      emitted = true;
    });
    // Clear initial replay
    emitted = false;

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'goal_status',
        chat_id: 'unknown',
        status: 'idle',
      }),
    );

    expect(emitted).toBe(false);
  });

  it('emits transport error for workspace_scope_rejected', () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const errors: unknown[] = [];
    socket.onTransportError((e) => errors.push(e));

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'error',
        chat_id: 'c1',
        detail: 'workspace_scope_rejected',
        reason: 'not allowed',
      }),
    );

    expect(errors).toHaveLength(1);
    expect((errors[0] as { kind: string }).kind).toBe('workspace_scope_rejected');
  });


  // ---- ready/attached events are consumed ----

  it('ready and attached events are not emitted via onEvent', () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const events: unknown[] = [];
    socket.onEvent((e) => events.push(e));

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({ event: 'ready', chat_id: 'c1' }),
    );
    MockWebSocket.last()!.fireMessage(
      JSON.stringify({ event: 'attached', chat_id: 'c1' }),
    );

    expect(events).toHaveLength(0);
  });
});
