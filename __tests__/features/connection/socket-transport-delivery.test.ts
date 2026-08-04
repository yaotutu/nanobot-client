import { describe, expect, it, vi } from 'vitest';

import { isSystemCommandTurnId } from '@/features/connection/socket-transport';

import { MockWebSocket, SENT_FRAMES, findSentFrame, makeSocket, setupSocketTestEnvironment } from './socket-test-fixture';

describe('socket transport delivery', () => {
  setupSocketTestEnvironment();

  // ---- pending messages rejected on close ----

  it('pending message sends are rejected when connection closes unexpectedly', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const result = socket.sendMessage('c1', 'hello');

    MockWebSocket.last()!.fireClose(1006);
    await expect(result.accepted).rejects.toThrow('delivery_unknown');
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

  it('does not replay a sent but unacknowledged message after reconnect', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();
    const result = socket.sendMessage('c1', 'do not replay');
    SENT_FRAMES.length = 0;

    MockWebSocket.last()!.fireClose(1006);
    await expect(result.accepted).rejects.toThrow('delivery_unknown');
    await vi.advanceTimersByTimeAsync(500);
    MockWebSocket.last()!.fireOpen();

    expect(findSentFrame('message')).toBeUndefined();
  });

  it('removes a queued message when its acceptance times out', async () => {
    const socket = makeSocket();
    const result = socket.sendMessage('c1', 'expires in queue', undefined, {
      acceptanceTimeoutMs: 1_000,
    });

    const rejection = expect(result.accepted).rejects.toThrow('message_accept_timeout');
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    MockWebSocket.last()!.fireOpen();

    expect(findSentFrame('message')).toBeUndefined();
  });
});
