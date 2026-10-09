import { describe, expect, it, vi } from 'vitest';

import { frameFitsTransport } from '@/features/connection/socket-protocol';
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

  it('measures non-ASCII transport frames in UTF-8 bytes', () => {
    const frame = {
      type: 'webui_request' as const,
      request_id: 'request-id',
      action: 'sidebar.update' as const,
      payload: { state: { title: '中文标题' } },
    };
    // JS 字符数会把每个中文按 1 计；这里必须按 UTF-8 字节限制，否则会绕过网关限制后被关闭。
    expect(frameFitsTransport(frame, JSON.stringify(frame).length)).toBe(false);
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


  // ---- WebUI mutations ----

  it('updateSidebarState sends an authenticated webui_request and resolves its response', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const state = { schema_version: 1, pinned_keys: ['first'], title_overrides: { 'websocket:c1': '新标题' } };
    const promise = socket.updateSidebarState(state as never);

    expect(lastSentFrame()!).toMatchObject({
      type: 'webui_request',
      action: 'sidebar.update',
      payload: { state },
    });
    const requestId = lastSentFrame()!.request_id as string;
    expect(requestId).toBeTruthy();

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'webui_response',
        request_id: requestId,
        ok: true,
        result: state,
      }),
    );

    await expect(promise).resolves.toEqual(state);
  });

  it('deleteSession sends a session.delete webui_request and resolves the deletion result', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.deleteSession('websocket:c1');
    expect(lastSentFrame()!).toEqual({
      type: 'webui_request',
      request_id: lastSentFrame()!.request_id,
      action: 'session.delete',
      payload: { key: 'websocket:c1' },
    });
    const requestId = lastSentFrame()!.request_id as string;

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'webui_response',
        request_id: requestId,
        ok: true,
        result: { deleted: true },
      }),
    );

    await expect(promise).resolves.toEqual({ deleted: true });
  });

  it('webui_request rejects with the server error response', async () => {
    const socket = makeSocket();
    MockWebSocket.last()!.fireOpen();

    const promise = socket.deleteSession('websocket:c1');
    const requestId = lastSentFrame()!.request_id as string;

    MockWebSocket.last()!.fireMessage(
      JSON.stringify({
        event: 'webui_response',
        request_id: requestId,
        ok: false,
        error: { status: 403, message: 'access_denied' },
      }),
    );

    await expect(promise).rejects.toThrow('access_denied');
  });

  it('a timed out webui_request is removed from the outbound queue', async () => {
    const socket = makeSocket();

    const promise = socket.deleteSession('websocket:c1');
    const rejection = expect(promise).rejects.toThrow('webui_request_timeout');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    MockWebSocket.last()!.fireOpen();
    expect(findSentFrame('webui_request')).toBeUndefined();
  });

  it('a queued webui_request is rejected and removed when the socket closes before sending', async () => {
    const socket = makeSocket();

    const promise = socket.deleteSession('websocket:c1');
    const rejection = expect(promise).rejects.toThrow('connection_closed');
    MockWebSocket.last()!.fireClose(1006);
    await rejection;

    MockWebSocket.instances.at(-1)!.fireOpen();
    expect(findSentFrame('webui_request')).toBeUndefined();
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
