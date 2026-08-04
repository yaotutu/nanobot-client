/**
 * WebSocket 传输层门面。
 *
 * 本类只持有连接状态并协调建连、重连、队列 flush 与入站路由。协议帧构造、监听器分发、
 * pending request 生命周期和恢复策略都位于独立模块，避免 transport 再次膨胀为业务总入口。
 */
import { routeSocketInboundEvent } from '@/features/connection/socket-inbound-router';
import {
  createSocketCommands,
  type SocketCommands,
  type SocketSendMessageOptions,
} from '@/features/connection/socket-commands';
import { SocketListeners } from '@/features/connection/socket-listeners';
import { SocketOutboundQueue } from '@/features/connection/socket-outbound-queue';
import { SocketPendingRegistry } from '@/features/connection/socket-pending-registry';
import { reconnectDelayMs } from '@/features/connection/socket-reconnect-policy';
import {
  isSystemCommandTurnId,
  normalizeMaxFrameBytes,
  parseInboundEvent,
  type EventListener,
  type MessageSendResult,
  type NanobotSocketOptions,
  type OutboundFrame,
  type RunStatusListener,
  type StatusListener,
  type TransportErrorListener,
} from '@/features/connection/socket-protocol';
import type { InboundEvent } from '@/types/api/chat/events';
import type { OutboundMedia } from '@/types/api/chat/media';
import type { ConnectionStatus } from '@/types/api/runtime';
import type { WorkspaceScopePayload } from '@/types/api/workspaces';

export type {
  EventListener,
  MessageSendResult,
  NanobotSocketOptions,
  OutboundFrame,
  Reauthenticate,
  RunStatusListener,
  StatusListener,
  TransportErrorListener,
} from '@/features/connection/socket-protocol';
export { isSocketDeliveryUnknownError } from '@/features/connection/socket-errors';
export { isSystemCommandTurnId } from '@/features/connection/socket-protocol';

export class NanobotSocket {
  private socket: WebSocket | null = null;
  private readonly listeners = new SocketListeners();
  private readonly pending = new SocketPendingRegistry();
  private readonly outbound = new SocketOutboundQueue();
  private readonly commands: SocketCommands;
  private knownChats = new Set<string>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectPromise: Promise<void> | null = null;
  private intentionallyClosed = false;
  private networkAvailable = true;
  private maxFrameBytes: number | undefined;

  constructor(private options: NanobotSocketOptions) {
    this.maxFrameBytes = normalizeMaxFrameBytes(options.maxFrameBytes);
    this.commands = createSocketCommands({
      pending: this.pending,
      outbound: this.outbound,
      knownChats: this.knownChats,
      isNetworkAvailable: () => this.networkAvailable,
      maxFrameBytes: () => this.maxFrameBytes,
      queueSend: (queueId, frame) => this.queueSend(queueId, frame),
      sendIfOpen: (frame) => this.rawSend(frame),
    });
  }

  onStatus(listener: StatusListener): () => void {
    return this.listeners.onStatus(listener);
  }

  onEvent(listener: EventListener): () => void {
    return this.listeners.onEvent(listener);
  }

  onRunStatus(listener: RunStatusListener): () => void {
    return this.listeners.onRunStatus(listener);
  }

  onTransportError(listener: TransportErrorListener): () => void {
    return this.listeners.onTransportError(listener);
  }

  getStatus(): ConnectionStatus {
    return this.listeners.getStatus();
  }

  updateUrl(url: string): void {
    this.options = { ...this.options, url };
  }

  updateMaxFrameBytes(maxFrameBytes?: number): void {
    this.maxFrameBytes = normalizeMaxFrameBytes(maxFrameBytes);
  }

  connect(): void {
    if (this.intentionallyClosed || !this.networkAvailable) return;
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) return;
    this.listeners.setStatus('connecting');
    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    socket.onopen = () => this.handleOpen(socket);
    socket.onmessage = (message) => {
      if (this.socket !== socket) return;
      const event = parseInboundEvent(message.data);
      if (event) this.handleInboundEvent(event);
    };
    socket.onclose = (event) => this.handleClose(socket, event.code);
    socket.onerror = () => {
      // The close handler owns retry and pending request cleanup.
    };
  }

  close(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();
    this.invalidateCurrentSocket(new Error('connection_closed'));
    this.outbound.clear();
    this.listeners.setStatus('closed');
  }

  setNetworkAvailable(available: boolean): void {
    if (this.networkAvailable === available) return;
    this.networkAvailable = available;
    if (available) return;
    this.clearReconnectTimer();
    this.invalidateCurrentSocket(new Error('network_unavailable'));
    this.listeners.setStatus('closed');
  }

  reconnectNow(): Promise<void> {
    if (this.intentionallyClosed || !this.networkAvailable) return Promise.resolve();
    if (this.reconnectPromise) return this.reconnectPromise;

    this.clearReconnectTimer();
    this.listeners.setStatus('reconnecting');

    const task = this.refreshConnectionUrl().then((refreshedUrl) => {
      if (this.intentionallyClosed || !this.networkAvailable) return;
      if (!refreshedUrl) {
        this.scheduleReconnect();
        return;
      }

      // Gateway WebSocket credentials are one-time tokens. Keep the existing
      // socket alive while minting the replacement token, then swap sockets.
      this.updateUrl(refreshedUrl);
      this.invalidateCurrentSocket(new Error('connection_closed'));
      this.connect();
    });
    this.reconnectPromise = task.finally(() => {
      this.reconnectPromise = null;
    });
    return this.reconnectPromise;
  }

  private async refreshConnectionUrl(): Promise<string | null> {
    try {
      return await this.options.reauthenticate();
    } catch {
      return null;
    }
  }

  attach(chatId: string): void {
    this.commands.attach(chatId);
  }

  newChat(timeoutMs = 5_000, workspaceScope?: WorkspaceScopePayload | null): Promise<string> {
    return this.commands.newChat(timeoutMs, workspaceScope);
  }

  forkChat(
    sourceChatId: string,
    beforeUserIndex: number,
    title?: string,
    timeoutMs = 5_000,
  ): Promise<string> {
    return this.commands.forkChat(sourceChatId, beforeUserIndex, title, timeoutMs);
  }

  sendMessage(
    chatId: string,
    content: string,
    media?: OutboundMedia[],
    options: SocketSendMessageOptions = {},
  ): MessageSendResult {
    return this.commands.sendMessage(chatId, content, media, options);
  }

  sendSystemCommand(chatId: string, command: string, timeoutMs = 5_000): Promise<void> {
    return this.commands.sendSystemCommand(chatId, command, timeoutMs);
  }

  transcribeAudio(
    dataUrl: string,
    options?: { durationMs?: number; timeoutMs?: number },
  ): Promise<string> {
    return this.commands.transcribeAudio(dataUrl, options);
  }

  setWorkspaceScope(chatId: string, scope: WorkspaceScopePayload): void {
    this.commands.setWorkspaceScope(chatId, scope);
  }

  stopTurn(chatId: string): void {
    this.commands.stopTurn(chatId);
  }

  private handleOpen(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.reconnectAttempt = 0;
    this.listeners.setStatus('open');
    for (const chatId of this.knownChats) this.rawSend({ type: 'attach', chat_id: chatId });
    this.outbound.flush((frame) => this.rawSend(frame));
  }

  private handleInboundEvent(event: InboundEvent): void {
    routeSocketInboundEvent(event, {
      listeners: this.listeners,
      pending: this.pending,
      knownChats: this.knownChats,
    });
  }

  private rawSend(frame: OutboundFrame): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(frame));
      if (frame.type === 'message' && !isSystemCommandTurnId(frame.turn_id)) {
        this.pending.markMessageSent(frame.chat_id, frame.turn_id);
      }
      return true;
    } catch {
      this.scheduleReconnect();
      return false;
    }
  }

  private queueSend(queueId: string, frame: OutboundFrame): void {
    if (this.rawSend(frame)) return;
    this.outbound.enqueue(queueId, frame);
  }

  private handleClose(socket: WebSocket, code?: number): void {
    if (this.socket !== socket) return;
    this.socket = null;
    const error = new Error(code === 1009 ? 'message_too_big' : 'connection_closed');
    this.rejectPendingOnDisconnect(error);
    if (this.intentionallyClosed || !this.networkAvailable) {
      this.listeners.setStatus('closed');
      return;
    }
    this.scheduleReconnect();
  }

  private invalidateCurrentSocket(error: Error): void {
    const socket = this.socket;
    this.socket = null;
    this.rejectPendingOnDisconnect(error);
    if (socket && socket.readyState < WebSocket.CLOSING) {
      try {
        socket.close();
      } catch {
        // The socket has already become unusable.
      }
    }
  }

  private rejectPendingOnDisconnect(error: Error): void {
    this.pending.rejectNewChat(error);
    this.pending.rejectMessagesOnClose(
      error,
      error.message === 'message_too_big' ? error : undefined,
    );
    this.pending.rejectTransientRequests(error);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.networkAvailable || this.intentionallyClosed) return;
    this.listeners.setStatus('reconnecting');
    const delay = reconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnectNow();
    }, delay);
  }
}

export function createNanobotSocket(options: NanobotSocketOptions): NanobotSocket {
  const socket = new NanobotSocket(options);
  socket.connect();
  return socket;
}
