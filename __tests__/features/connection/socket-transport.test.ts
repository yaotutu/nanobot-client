import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createNanobotSocket,
  isSystemCommandTurnId,
  type NanobotSocket,
} from '@/features/connection/socket-transport';

// ---------------------------------------------------------------------------
// Minimal WebSocket mock — captures all sent frames at class level
// ---------------------------------------------------------------------------

const SENT_FRAMES: string[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];
  static last(): MockWebSocket | undefined {
    return this.instances[this.instances.length - 1];
  }
  static reset(): void {
    this.instances = [];
    SENT_FRAMES.length = 0;
  }

  static sentFrames(): unknown[] {
    return SENT_FRAMES.map((d) => JSON.parse(d));
  }

  readyState = 0; // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
  url: string;

  // Set by NanobotSocket (direct property assignment)
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    SENT_FRAMES.push(data);
  }

  close(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  // helpers for tests
  fireOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  fireMessage(data: string): void {
    this.onmessage?.({ data });
  }

  fireClose(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
  MockWebSocket;

function lastSentFrame(): Record<string, unknown> | undefined {
  const frames = MockWebSocket.sentFrames();
  return frames[frames.length - 1] as Record<string, unknown> | undefined;
}

function findSentFrame(type: string): Record<string, unknown> | undefined {
  return MockWebSocket.sentFrames().find(
    (f) => (f as Record<string, unknown>).type === type,
  ) as Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSocket(overrides?: Partial<{
  url: string;
  reauthenticate: () => Promise<string | null>;
  maxFrameBytes: number;
}>): NanobotSocket {
  return createNanobotSocket({
    url: overrides?.url ?? 'ws://test',
    reauthenticate: overrides?.reauthenticate ?? (async () => null),
    maxFrameBytes: overrides?.maxFrameBytes,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('socket-transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- connection lifecycle ----

  it('connects and fires status open', () => {
    const statuses: string[] = [];
    const socket = makeSocket();
    socket.onStatus((s) => statuses.push(s));

    expect(statuses).toEqual(['connecting']);
    MockWebSocket.last()!.fireOpen();
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('close() sets status to closed and prevents reconnect', () => {
    const statuses: string[] = [];
    const socket = makeSocket();
    socket.onStatus((s) => statuses.push(s));
    MockWebSocket.last()!.fireOpen();

    socket.close();
    expect(statuses).toContain('closed');

    // No reconnect should happen
    vi.advanceTimersByTime(30_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  // ---- reconnection ----

  it('reconnects with exponential backoff on unexpected close', async () => {
    const reauthenticate = vi.fn(async () => 'ws://refreshed');
    makeSocket({ reauthenticate });
    MockWebSocket.last()!.fireOpen();

    // Unexpected close
    MockWebSocket.last()!.fireClose(1006);
    // First reconnect after ~500ms (async reauthenticate → flush microtasks)
    await vi.advanceTimersByTimeAsync(500);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(reauthenticate).toHaveBeenCalledOnce();
  });

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

  // ---- message sending ----

  it('sendMessage returns a turnId and resolves acceptance on message_accepted', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const result = socket.sendMessage('c1', 'hello');
    expect(result.turnId).toBeTruthy();

    const frame = lastSentFrame()!;
    expect(frame).toMatchObject({
      type: 'message',
      chat_id: 'c1',
      content: 'hello',
      webui: true,
    });

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'message_accepted',
        chat_id: 'c1',
        turn_id: result.turnId,
      }),
    );

    await expect(result.accepted).resolves.toBeUndefined();
  });

  it('sendMessage rejects on error event before acceptance', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const result = socket.sendMessage('c1', 'hello');

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'error',
        chat_id: 'c1',
        turn_id: result.turnId,
        detail: 'rate_limited',
        reason: 'too many requests',
      }),
    );

    await expect(result.accepted).rejects.toThrow('rate_limited');
  });

  it('sendMessage rejects with transport_too_large when frame exceeds maxFrameBytes', async () => {
    const socket = makeSocket({ maxFrameBytes: 50 });
    MockWebSocket.last()!.fireOpen();

    const result = socket.sendMessage('c1', 'this content is way too long');
    await expect(result.accepted).rejects.toThrow('transport_too_large');
  });

  // ---- system commands ----

  it('sendSystemCommand resolves on turn_end', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.sendSystemCommand('c1', '/model gpt-4');
    const frame = lastSentFrame()!;
    const turnId = frame.turn_id as string;

    expect(isSystemCommandTurnId(turnId)).toBe(true);

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'turn_end',
        chat_id: 'c1',
        turn_id: turnId,
      }),
    );

    await expect(promise).resolves.toBeUndefined();
  });

  it('sendSystemCommand rejects on error', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.sendSystemCommand('c1', '/bad');
    const frame = lastSentFrame()!;
    const turnId = frame.turn_id as string;

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'error',
        chat_id: 'c1',
        turn_id: turnId,
        detail: 'unknown_command',
      }),
    );

    await expect(promise).rejects.toThrow('unknown_command');
  });

  it('sendSystemCommand times out', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.sendSystemCommand('c1', '/slow', 1_000);
    vi.advanceTimersByTime(1_000);
    await expect(promise).rejects.toThrow('system command timeout');
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

  // ---- new chat ----

  it('newChat resolves when a ready event arrives', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.newChat();

    expect(lastSentFrame()!.type).toBe('new_chat');

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({ event: 'ready', chat_id: 'new-chat-id' }),
    );

    await expect(promise).resolves.toBe('new-chat-id');
  });

  it('newChat rejects on timeout', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.newChat(1_000);
    vi.advanceTimersByTime(1_000);
    await expect(promise).rejects.toThrow('newChat timeout');
  });

  // ---- fork chat ----

  it('forkChat rejects with invalid position', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    await expect(socket.forkChat('c1', -1)).rejects.toThrow('invalid fork position');
    await expect(socket.forkChat('  ', 0)).rejects.toThrow('invalid fork position');
  });

  it('forkChat resolves when ready event arrives', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.forkChat('source-chat', 2, 'Forked');

    expect(lastSentFrame()!).toMatchObject({
      type: 'fork_chat',
      source_chat_id: 'source-chat',
      before_user_index: 2,
      title: 'Forked',
    });

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({ event: 'ready', chat_id: 'forked-chat-id' }),
    );

    await expect(promise).resolves.toBe('forked-chat-id');
  });

  // ---- attach on reconnect ----

  it('re-attaches known chats after reconnect', async () => {
    const reauthenticate = vi.fn(async () => 'ws://refreshed');
    const socket = makeSocket({ reauthenticate });
    MockWebSocket.last()!.fireOpen();

    socket.attach('chat-1');

    // Trigger reconnect
    MockWebSocket.last()!.fireClose(1006);
    await vi.advanceTimersByTimeAsync(500);

    // New socket opens — clear sent frames to isolate reconnect sends
    SENT_FRAMES.length = 0;
    MockWebSocket.last()!.fireOpen();

    const attachFrame = findSentFrame('attach');
    expect(attachFrame).toBeTruthy();
    expect(attachFrame).toMatchObject({
      type: 'attach',
      chat_id: 'chat-1',
    });
  });

  // ---- pending messages rejected on close ----

  it('pending message sends are rejected when connection closes unexpectedly', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const result = socket.sendMessage('c1', 'hello');

    MockWebSocket.last()!.fireClose(1006);
    await expect(result.accepted).rejects.toThrow('connection_closed');
  });

  it('pending message sends are rejected with message_too_big on code 1009', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const result = socket.sendMessage('c1', 'hello');

    MockWebSocket.last()!.fireClose(1009);
    await expect(result.accepted).rejects.toThrow('message_too_big');
  });

  // ---- isSystemCommandTurnId ----

  it('isSystemCommandTurnId correctly identifies system command turn ids', () => {
    expect(isSystemCommandTurnId('webui-system:abc')).toBe(true);
    expect(isSystemCommandTurnId('normal-turn-id')).toBe(false);
    expect(isSystemCommandTurnId(null)).toBe(false);
    expect(isSystemCommandTurnId(undefined)).toBe(false);
    expect(isSystemCommandTurnId('')).toBe(false);
  });

  // ---- queued sends while disconnected ----

  it('queues frames while disconnected and flushes on reconnect', async () => {
    const reauthenticate = vi.fn(async () => 'ws://refreshed');
    const socket = makeSocket({ reauthenticate });

    // Connect then disconnect
    MockWebSocket.last()!.fireOpen();
    MockWebSocket.last()!.fireClose(1006);
    await vi.advanceTimersByTimeAsync(500);

    // New socket is connecting but not yet open — send a message
    socket.sendMessage('c1', 'queued message');

    // Should not have sent yet (socket still CONNECTING)
    expect(findSentFrame('message')).toBeUndefined();

    // Now open
    SENT_FRAMES.length = 0;
    MockWebSocket.last()!.fireOpen();

    // Should have flushed the queued message
    expect(findSentFrame('message')).toMatchObject({
      type: 'message',
      chat_id: 'c1',
      content: 'queued message',
    });
  });
});
