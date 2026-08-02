/**
 * Transport-only WebSocket facade. Protocol helpers, listener fan-out, and
 * pending request lifecycle live in focused modules; this class coordinates
 * socket lifecycle and preserves the public NanobotSocket API.
 */
import { SocketListeners } from '@/features/connection/socket-listeners';
import { SocketPendingRegistry } from '@/features/connection/socket-pending-registry';
import {
  SYSTEM_COMMAND_TURN_PREFIX,
  createTurnId,
  eventTurnId,
  frameFitsTransport,
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
import type {
  InboundEvent,
  OutboundMedia,
  UICliAppAttachment,
  UIMcpPresetAttachment,
} from '@/types/api/chat';
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
export { isSystemCommandTurnId } from '@/features/connection/socket-protocol';

export class NanobotSocket {
  private socket: WebSocket | null = null;
  private readonly listeners = new SocketListeners();
  private readonly pending = new SocketPendingRegistry();
  private knownChats = new Set<string>();
  private sendQueue: OutboundFrame[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private maxFrameBytes: number | undefined;

  constructor(private options: NanobotSocketOptions) {
    this.maxFrameBytes = normalizeMaxFrameBytes(options.maxFrameBytes);
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

  updateUrl(url: string): void {
    this.options = { ...this.options, url };
  }

  updateMaxFrameBytes(maxFrameBytes?: number): void {
    this.maxFrameBytes = normalizeMaxFrameBytes(maxFrameBytes);
  }

  connect(): void {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) return;
    this.intentionallyClosed = false;
    this.listeners.setStatus('connecting');
    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    socket.onopen = () => this.handleOpen(socket);
    socket.onmessage = (message) => {
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
  }

  attach(chatId: string): void {
    this.knownChats.add(chatId);
    this.queueSend({ type: 'attach', chat_id: chatId });
  }

  newChat(timeoutMs = 5_000, workspaceScope?: WorkspaceScopePayload | null): Promise<string> {
    const request = this.pending.createNewChat(timeoutMs, 'newChat timeout');
    if (!this.pending.hasNewChat()) return request;
    this.queueSend({
      type: 'new_chat',
      ...(workspaceScope ? { workspace_scope: workspaceScope } : {}),
    });
    return request;
  }

  forkChat(sourceChatId: string, beforeUserIndex: number, title?: string, timeoutMs = 5_000): Promise<string> {
    if (this.pending.hasNewChat()) return Promise.reject(new Error('newChat already in flight'));
    if (!sourceChatId.trim() || !Number.isInteger(beforeUserIndex) || beforeUserIndex < 0) {
      return Promise.reject(new Error('invalid fork position'));
    }
    const request = this.pending.createNewChat(timeoutMs, 'fork timeout');
    this.queueSend({
      type: 'fork_chat',
      source_chat_id: sourceChatId,
      before_user_index: beforeUserIndex,
      ...(title?.trim() ? { title: title.trim() } : {}),
    });
    return request;
  }

  sendMessage(
    chatId: string,
    content: string,
    media?: OutboundMedia[],
    options: {
      cliApps?: UICliAppAttachment[];
      mcpPresets?: UIMcpPresetAttachment[];
      quotedContext?: string;
      workspaceScope?: WorkspaceScopePayload | null;
      startsNewRun?: boolean;
    } = {},
  ): MessageSendResult {
    const turnId = createTurnId();
    const startsNewRun = options.startsNewRun !== false;
    this.knownChats.add(chatId);
    const result = this.pending.createMessageSend(chatId, turnId, startsNewRun);
    const frame: OutboundFrame = {
      type: 'message',
      chat_id: chatId,
      content,
      ...(media?.length ? { media } : {}),
      ...(options.cliApps?.length ? { cli_apps: options.cliApps } : {}),
      ...(options.mcpPresets?.length ? { mcp_presets: options.mcpPresets } : {}),
      ...(options.quotedContext?.trim() ? { quoted_context: options.quotedContext.trim() } : {}),
      ...(options.workspaceScope ? { workspace_scope: options.workspaceScope } : {}),
      turn_id: turnId,
      webui: true,
    };
    if (!frameFitsTransport(frame, this.maxFrameBytes)) {
      this.pending.rejectMessage(chatId, turnId, new Error('transport_too_large'));
      return result;
    }
    this.queueSend(frame);
    return result;
  }

  sendSystemCommand(chatId: string, command: string, timeoutMs = 5_000): Promise<void> {
    const turnId = `${SYSTEM_COMMAND_TURN_PREFIX}${createTurnId()}`;
    this.knownChats.add(chatId);
    const request = this.pending.createSystemCommand(turnId, timeoutMs);
    this.queueSend({ type: 'message', chat_id: chatId, content: command.trim(), turn_id: turnId, webui: true });
    return request;
  }

  transcribeAudio(dataUrl: string, options?: { durationMs?: number; timeoutMs?: number }): Promise<string> {
    const requestId = createTurnId();
    const request = this.pending.createTranscription(requestId, options?.timeoutMs ?? 120_000);
    this.queueSend({
      type: 'transcribe_audio',
      request_id: requestId,
      data_url: dataUrl,
      ...(options?.durationMs !== undefined ? { duration_ms: options.durationMs } : {}),
    });
    return request;
  }

  setWorkspaceScope(chatId: string, scope: WorkspaceScopePayload): void {
    this.knownChats.add(chatId);
    this.queueSend({ type: 'set_workspace_scope', chat_id: chatId, workspace_scope: scope });
  }

  stopTurn(chatId: string): void {
    this.sendSystemCommand(chatId, '/stop', 5_000).catch(() => undefined);
  }

  private handleOpen(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.reconnectAttempt = 0;
    this.listeners.setStatus('open');
    for (const chatId of this.knownChats) this.queueSend({ type: 'attach', chat_id: chatId });
    for (const frame of this.sendQueue.splice(0)) this.rawSend(frame);
  }

  private handleInboundEvent(event: InboundEvent): void {
    if (event.event === 'transcription_result') {
      this.pending.resolveTranscription(event.request_id, event.text);
      return;
    }
    if (event.event === 'transcription_error') {
      this.pending.rejectTranscription(event.request_id, event.detail);
      return;
    }

    const turnId = eventTurnId(event);
    if (isSystemCommandTurnId(turnId)) {
      if (event.event === 'error') {
        this.pending.rejectSystemCommand(turnId, this.eventError(event));
      } else if (event.event === 'message' || event.event === 'turn_end') {
        this.pending.resolveSystemCommand(turnId);
      }
      return;
    }

    if (event.event === 'message_accepted') {
      this.pending.acceptMessage(event.chat_id, event.turn_id);
      return;
    }
    if (event.event === 'error' && event.chat_id && turnId) {
      this.pending.rejectMessage(event.chat_id, turnId, this.eventError(event));
      if (event.detail !== 'workspace_scope_rejected') {
        this.listeners.emitTransportError({
          kind: 'turn_rejected',
          chatId: event.chat_id,
          turnId,
          detail: event.detail,
          reason: (event as { reason?: string }).reason,
        });
      }
    }
    if (event.event === 'error' && event.detail === 'workspace_scope_rejected') {
      this.listeners.emitTransportError({
        kind: 'workspace_scope_rejected',
        chatId: event.chat_id,
        turnId: turnId ?? undefined,
        reason: (event as { reason?: string }).reason,
      });
    }
    if (event.event === 'goal_status') {
      if (event.status === 'running') {
        if (typeof event.started_at === 'number') this.listeners.setRunStatus(event.chat_id, event.started_at);
        this.pending.acceptFallback(event.chat_id, true);
      }
      if (event.status === 'idle') this.listeners.clearRunStatus(event.chat_id);
    }
    if (
      'chat_id' in event &&
      event.chat_id &&
      ['delta', 'reasoning_delta', 'message', 'stream_end', 'turn_end'].includes(event.event)
    ) {
      this.pending.acceptFallback(event.chat_id);
    }
    if ((event.event === 'ready' || event.event === 'attached') && event.chat_id) {
      this.knownChats.add(event.chat_id);
      this.pending.resolveNewChat(event.chat_id);
      return;
    }
    if (event.event === 'attached') return;
    this.listeners.emitEvent(event);
  }

  private eventError(event: InboundEvent): Error {
    const detail = 'detail' in event && typeof event.detail === 'string' ? event.detail : '';
    const reason = 'reason' in event && typeof event.reason === 'string' ? event.reason : '';
    return new Error([detail, reason].filter(Boolean).join(': '));
  }

  private rawSend(frame: OutboundFrame): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(frame));
    } catch {
      // A later close event owns recovery.
    }
  }

  private queueSend(frame: OutboundFrame): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.rawSend(frame);
    else this.sendQueue.push(frame);
  }

  private handleClose(socket: WebSocket, code?: number): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.pending.rejectNewChat(new Error('connection closed before chat created'));
    this.pending.rejectMessagesOnClose(new Error(code === 1009 ? 'message_too_big' : 'connection_closed'));
    if (this.intentionallyClosed) {
      this.listeners.setStatus('closed');
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.listeners.setStatus('reconnecting');
    const delay = Math.min(500 * 2 ** this.reconnectAttempt, 15_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        const refreshedUrl = await this.options.reauthenticate();
        if (refreshedUrl) this.updateUrl(refreshedUrl);
      } catch {
        // Reconnect with the current URL when token refresh fails.
      }
      this.connect();
    }, delay);
  }
}

export function createNanobotSocket(options: NanobotSocketOptions): NanobotSocket {
  const socket = new NanobotSocket(options);
  socket.connect();
  return socket;
}
