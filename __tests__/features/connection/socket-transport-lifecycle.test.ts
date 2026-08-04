import { describe, expect, it, vi } from 'vitest';

import { reconnectDelayMs } from '@/features/connection/socket-reconnect-policy';

import { MockWebSocket, SENT_FRAMES, findSentFrame, makeSocket, setupSocketTestEnvironment } from './socket-test-fixture';

describe('socket transport lifecycle', () => {
  setupSocketTestEnvironment();

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

  it('caps reconnect backoff and normalizes invalid attempts', () => {
    expect(reconnectDelayMs(-1)).toBe(500);
    expect(reconnectDelayMs(0)).toBe(500);
    expect(reconnectDelayMs(1)).toBe(1_000);
    expect(reconnectDelayMs(20)).toBe(15_000);
  });


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


  it('pauses reconnects while offline and reconnects immediately when requested after restore', async () => {
    const reauthenticate = vi.fn(async () => 'ws://restored');
    const socket = makeSocket({ reauthenticate });
    MockWebSocket.last()!.fireOpen();

    socket.setNetworkAvailable(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(MockWebSocket.instances).toHaveLength(1);

    socket.setNetworkAvailable(true);
    await socket.reconnectNow();
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.last()!.url).toBe('ws://restored');
    expect(reauthenticate).toHaveBeenCalledOnce();
  });


  it('ignores callbacks from a socket replaced by reconnectNow', async () => {
    const socket = makeSocket({ reauthenticate: async () => 'ws://replacement' });
    const oldSocket = MockWebSocket.last()!;
    oldSocket.fireOpen();

    await socket.reconnectNow();
    const replacement = MockWebSocket.last()!;
    expect(replacement).not.toBe(oldSocket);

    oldSocket.fireClose(1006);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });
});
