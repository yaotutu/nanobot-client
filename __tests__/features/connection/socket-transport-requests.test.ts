import { describe, expect, it, vi } from 'vitest';

import { isSystemCommandTurnId } from '@/features/connection/socket-transport';

import { MockWebSocket, findSentFrame, lastSentFrame, makeSocket, setupSocketTestEnvironment } from './socket-test-fixture';

describe('socket transport requests', () => {
  setupSocketTestEnvironment();

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

  it('newChat resolves when the gateway acknowledges with attached', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.newChat();

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({ event: 'attached', chat_id: 'new-chat-id' }),
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


  it('removes a queued new_chat frame when the request times out', async () => {
    const socket = makeSocket();
    const request = socket.newChat(1_000);

    const rejection = expect(request).rejects.toThrow('newChat timeout');
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    MockWebSocket.last()!.fireOpen();

    expect(findSentFrame('new_chat')).toBeUndefined();
  });
});
