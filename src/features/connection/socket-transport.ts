/**
 * NanobotSocket —— transport-only wrapper around the WebSocket protocol.
 *
 * 关注点（仅此而已）：
 *   ① WebSocket 生命周期（connect / reconnect / close）
 *   ② 帧发送队列
 *   ③ 入站事件分发（onEvent）
 *   ④ 三类挂起（消息 / 转写 / 系统命令）的 timeout
 *   ⑤ 重新认证（reauthenticate）
 *
 * 业务语义（run generation / canonical reconciliation / side-channel routing）已
 * 迁到 `features/chat/store.ts`。
 */
import type {
  ConnectionStatus,
  InboundEvent,
  OutboundMedia,
  StreamError,
  UICliAppAttachment,
  UIMcpPresetAttachment,
  WorkspaceScopePayload,
} from '@/types/api';

export type StatusListener = (status: ConnectionStatus) => void;
export type EventListener = (event: InboundEvent) => void;
export type RunStatusListener = (chatId: string, startedAt: number | null) => void;
export type TransportErrorListener = (error: StreamError) => void;
export type Reauthenticate = () => Promise<string | null>;

export type OutboundFrame =
  | { type: 'new_chat'; workspace_scope?: WorkspaceScopePayload }
  | { type: 'fork_chat'; source_chat_id: string; before_user_index: number; title?: string }
  | { type: 'attach'; chat_id: string }
  | { type: 'set_workspace_scope'; chat_id: string; workspace_scope: WorkspaceScopePayload }
  | {
      type: 'message';
      chat_id: string;
      content: string;
      media?: OutboundMedia[];
      cli_apps?: UICliAppAttachment[];
      mcp_presets?: UIMcpPresetAttachment[];
      quoted_context?: string;
      workspace_scope?: WorkspaceScopePayload;
      turn_id: string;
      webui: true;
    }
  | { type: 'transcribe_audio'; request_id: string; data_url: string; duration_ms?: number };

export interface MessageSendResult {
  turnId: string;
  accepted: Promise<void>;
}

interface PendingMessageSend {
  chatId: string;
  turnId: string;
  startsNewRun: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
  acceptanceSettled: boolean;
}

interface PendingTranscription {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingSystemCommand {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const SYSTEM_COMMAND_TURN_PREFIX = 'webui-system:';

function createTurnId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function eventTurnId(event: InboundEvent): string | null {
  return 'turn_id' in event && typeof event.turn_id === 'string' ? event.turn_id : null;
}

export function isSystemCommandTurnId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(SYSTEM_COMMAND_TURN_PREFIX);
}

function runSendKey(chatId: string, turnId: string): string {
  return `${chatId}:${turnId}`;
}

export interface NanobotSocketOptions {
  url: string;
  reauthenticate: Reauthenticate;
  maxFrameBytes?: number;
}

export class NanobotSocket {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'idle';
  private statusListeners = new Set<StatusListener>();
  private eventListeners = new Set<EventListener>();
  private runStatusListeners = new Set<RunStatusListener>();
  private transportErrorListeners = new Set<TransportErrorListener>();
  private knownChats = new Set<string>();
  private sendQueue: OutboundFrame[] = [];
  private pendingMessageSends = new Map<string, PendingMessageSend>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private maxFrameBytes: number | undefined;
  private pendingNewChat: {
    resolve: (chatId: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private runStartedAtByChatId = new Map<string, number>();

  constructor(private options: NanobotSocketOptions) {
    this.maxFrameBytes = this.normalizeMaxFrameBytes(options.maxFrameBytes);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onRunStatus(listener: RunStatusListener): () => void {
    this.runStatusListeners.add(listener);
    for (const [chatId, startedAt] of this.runStartedAtByChatId) {
      listener(chatId, startedAt);
    }
    return () => this.runStatusListeners.delete(listener);
  }

  onTransportError(listener: TransportErrorListener): () => void {
    this.transportErrorListeners.add(listener);
    return () => this.transportErrorListeners.delete(listener);
  }

  updateUrl(url: string): void {
    this.options = { ...this.options, url };
  }

  updateMaxFrameBytes(maxFrameBytes?: number): void {
    this.maxFrameBytes = this.normalizeMaxFrameBytes(maxFrameBytes);
  }

  connect(): void {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) return;
    this.intentionallyClosed = false;
    this.setStatus('connecting');
    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus('open');
      for (const chatId of this.knownChats) this.queueSend({ type: 'attach', chat_id: chatId });
      for (const frame of this.sendQueue.splice(0)) this.rawSend(frame);
    };
    socket.onmessage = (message) => {
      if (typeof message.data !== 'string') return;
      try {
        const event = JSON.parse(message.data) as InboundEvent;
        if (event.event === 'transcription_result') {
          this.resolveTranscription(event.request_id, event.text);
          return;
        }
        if (event.event === 'transcription_error') {
          this.rejectTranscription(event.request_id, event.detail);
          return;
        }
        if (isSystemCommandTurnId(eventTurnId(event))) {
          if (event.event === 'error') {
            this.rejectSystemCommand(
              eventTurnId(event) as string,
              new Error(
                [event.detail, (event as { reason?: string }).reason].filter(Boolean).join(': '),
              ),
            );
          } else if (event.event === 'message' || event.event === 'turn_end') {
            this.resolveSystemCommand(eventTurnId(event) as string);
          }
          return;
        }
        if (event.event === 'message_accepted') {
          this.recordRunAcceptance(event.chat_id, event.turn_id);
          return;
        }
        if (event.event === 'error' && event.chat_id && eventTurnId(event)) {
          this.recordRunRejection(
            event.chat_id,
            eventTurnId(event) as string,
            new Error(
              [event.detail, (event as { reason?: string }).reason].filter(Boolean).join(': '),
            ),
          );
          if (event.detail !== 'workspace_scope_rejected') {
            this.emitTransportError({
              kind: 'turn_rejected',
              chatId: event.chat_id,
              turnId: eventTurnId(event) as string,
              detail: event.detail,
              reason: (event as { reason?: string }).reason,
            });
          }
        }
        if (
          event.event === 'error' &&
          event.detail === 'workspace_scope_rejected'
        ) {
          this.emitTransportError({
            kind: 'workspace_scope_rejected',
            chatId: event.chat_id,
            turnId: eventTurnId(event) ?? undefined,
            reason: (event as { reason?: string }).reason,
          });
        }
        if (event.event === 'goal_status') {
          if (event.status === 'running') {
            if (typeof event.started_at === 'number') {
              this.runStartedAtByChatId.set(event.chat_id, event.started_at);
              this.emitRunStatus(event.chat_id, event.started_at);
            }
            // Older gateways do not send message_accepted. A running status is
            // the server's positive acknowledgement for a normal turn.
            this.recordFallbackRunAcceptance(event.chat_id, true);
          }
          if (event.status === 'idle') {
            if (this.runStartedAtByChatId.delete(event.chat_id)) {
              this.emitRunStatus(event.chat_id, null);
            }
          }
        }
        if (
          'chat_id' in event &&
          event.chat_id &&
          (event.event === 'delta' ||
            event.event === 'reasoning_delta' ||
            event.event === 'message' ||
            event.event === 'stream_end' ||
            event.event === 'turn_end')
        ) {
          // Resolve sends for gateways that omit message_accepted once the
          // first turn event proves the frame was accepted.
          this.recordFallbackRunAcceptance(event.chat_id);
        }
        if ((event.event === 'ready' || event.event === 'attached') && event.chat_id) {
          this.knownChats.add(event.chat_id);
          if (this.pendingNewChat) {
            clearTimeout(this.pendingNewChat.timer);
            this.pendingNewChat.resolve(event.chat_id);
            this.pendingNewChat = null;
          }
          return;
        }
        if (event.event === 'attached') return;
        this.emitEvent(event);
      } catch {
        // ignore parse errors
      }
    };
    socket.onclose = (event) => this.handleClose(event.code);
    socket.onerror = () => {
      // close handler will fire too
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
    if (this.pendingNewChat) return Promise.reject(new Error('newChat already in flight'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingNewChat = null;
        reject(new Error('newChat timeout'));
      }, timeoutMs);
      this.pendingNewChat = { resolve, reject, timer };
      this.queueSend({
        type: 'new_chat',
        ...(workspaceScope ? { workspace_scope: workspaceScope } : {}),
      });
    });
  }

  forkChat(sourceChatId: string, beforeUserIndex: number, title?: string, timeoutMs = 5_000): Promise<string> {
    if (this.pendingNewChat) return Promise.reject(new Error('newChat already in flight'));
    if (!sourceChatId.trim() || !Number.isInteger(beforeUserIndex) || beforeUserIndex < 0) {
      return Promise.reject(new Error('invalid fork position'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingNewChat = null;
        reject(new Error('fork timeout'));
      }, timeoutMs);
      this.pendingNewChat = { resolve, reject, timer };
      this.queueSend({
        type: 'fork_chat',
        source_chat_id: sourceChatId,
        before_user_index: beforeUserIndex,
        ...(title?.trim() ? { title: title.trim() } : {}),
      });
    });
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
    let resolveAccepted!: () => void;
    let rejectAccepted!: (error: Error) => void;
    const accepted = new Promise<void>((resolve, reject) => {
      resolveAccepted = resolve;
      rejectAccepted = reject;
    });
    const pending: PendingMessageSend = {
      chatId,
      turnId,
      startsNewRun,
      resolve: resolveAccepted,
      reject: rejectAccepted,
      acceptanceSettled: false,
    };
    this.pendingMessageSends.set(runSendKey(chatId, turnId), pending);
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
    if (!this.frameFitsTransport(frame)) {
      const error = new Error('transport_too_large');
      pending.reject(error);
      this.pendingMessageSends.delete(runSendKey(chatId, turnId));
      return { turnId, accepted };
    }
    this.queueSend(frame);
    return { turnId, accepted };
  }

  sendSystemCommand(chatId: string, command: string, timeoutMs = 5_000): Promise<void> {
    const turnId = `${SYSTEM_COMMAND_TURN_PREFIX}${createTurnId()}`;
    this.knownChats.add(chatId);
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSystemCommands.delete(turnId);
        reject(new Error('system command timeout'));
      }, timeoutMs);
      this.pendingSystemCommands.set(turnId, { resolve, reject, timer });
      this.queueSend({
        type: 'message',
        chat_id: chatId,
        content: command.trim(),
        turn_id: turnId,
        webui: true,
      });
    });
  }

  transcribeAudio(dataUrl: string, options?: { durationMs?: number; timeoutMs?: number }): Promise<string> {
    const requestId = createTurnId();
    const timeoutMs = options?.timeoutMs ?? 120_000;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTranscriptions.delete(requestId);
        reject(new Error('transcription_timeout'));
      }, timeoutMs);
      this.pendingTranscriptions.set(requestId, { resolve, reject, timer });
      this.queueSend({
        type: 'transcribe_audio',
        request_id: requestId,
        data_url: dataUrl,
        ...(options?.durationMs !== undefined ? { duration_ms: options.durationMs } : {}),
      });
    });
  }

  setWorkspaceScope(chatId: string, scope: WorkspaceScopePayload): void {
    this.knownChats.add(chatId);
    this.queueSend({ type: 'set_workspace_scope', chat_id: chatId, workspace_scope: scope });
  }

  stopTurn(chatId: string): void {
    // 简单实现：发一个 side-channel /stop 命令
    this.sendSystemCommand(chatId, '/stop', 5_000).catch(() => undefined);
  }

  // ---- internals ----

  private normalizeMaxFrameBytes(value?: number): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  }

  private frameFitsTransport(frame: OutboundFrame): boolean {
    if (!this.maxFrameBytes) return true;
    return JSON.stringify(frame).length <= this.maxFrameBytes;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      try { listener(status); } catch { /* */ }
    }
  }

  private emitEvent(event: InboundEvent): void {
    for (const listener of this.eventListeners) {
      try { listener(event); } catch { /* */ }
    }
  }

  private emitRunStatus(chatId: string, startedAt: number | null): void {
    for (const listener of this.runStatusListeners) {
      try { listener(chatId, startedAt); } catch { /* */ }
    }
  }

  private emitTransportError(error: StreamError): void {
    for (const listener of this.transportErrorListeners) {
      try { listener(error); } catch { /* */ }
    }
  }

  private recordFallbackRunAcceptance(chatId: string, startsNewRun?: boolean): void {
    for (const pending of this.pendingMessageSends.values()) {
      if (pending.chatId !== chatId || pending.acceptanceSettled) continue;
      if (startsNewRun !== undefined && pending.startsNewRun !== startsNewRun) continue;
      pending.acceptanceSettled = true;
      pending.resolve();
      return;
    }
  }

  private recordRunAcceptance(chatId: string, turnId: string): void {
    const pending = this.pendingMessageSends.get(runSendKey(chatId, turnId));
    if (!pending) return;
    if (!pending.acceptanceSettled) {
      pending.acceptanceSettled = true;
      pending.resolve();
    }
  }

  private recordRunRejection(chatId: string, turnId: string, error: Error): void {
    const pending = this.pendingMessageSends.get(runSendKey(chatId, turnId));
    if (pending) {
      if (!pending.acceptanceSettled) {
        pending.acceptanceSettled = true;
        pending.reject(error);
      }
      this.pendingMessageSends.delete(runSendKey(chatId, turnId));
    }
  }

  private pendingSystemCommands = new Map<string, PendingSystemCommand>();

  private resolveSystemCommand(turnId: string): void {
    const pending = this.pendingSystemCommands.get(turnId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingSystemCommands.delete(turnId);
    pending.resolve();
  }

  private rejectSystemCommand(turnId: string, error: Error): void {
    const pending = this.pendingSystemCommands.get(turnId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingSystemCommands.delete(turnId);
    pending.reject(error);
  }

  private pendingTranscriptions = new Map<string, PendingTranscription>();

  private resolveTranscription(requestId: string, text: string): void {
    const pending = this.pendingTranscriptions.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingTranscriptions.delete(requestId);
    pending.resolve(text);
  }

  private rejectTranscription(requestId?: string, detail?: string): void {
    if (!requestId) {
      for (const [r, p] of this.pendingTranscriptions) {
        clearTimeout(p.timer);
        p.reject(new Error(detail || 'transcription_failed'));
        this.pendingTranscriptions.delete(r);
      }
      return;
    }
    const pending = this.pendingTranscriptions.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingTranscriptions.delete(requestId);
    pending.reject(new Error(detail || 'transcription_failed'));
  }

  private rawSend(frame: OutboundFrame): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(frame));
    } catch {
      // ignore
    }
  }

  private queueSend(frame: OutboundFrame): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.rawSend(frame);
    } else {
      this.sendQueue.push(frame);
    }
  }

  private handleClose(code?: number): void {
    this.socket = null;
    if (this.pendingNewChat) {
      clearTimeout(this.pendingNewChat.timer);
      this.pendingNewChat.reject(new Error('connection closed before chat created'));
      this.pendingNewChat = null;
    }
    for (const [, pending] of this.pendingMessageSends) {
      if (!pending.acceptanceSettled) {
        pending.acceptanceSettled = true;
        pending.reject(new Error(code === 1009 ? 'message_too_big' : 'connection_closed'));
      }
    }
    this.pendingMessageSends.clear();
    if (this.intentionallyClosed) {
      this.setStatus('closed');
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.setStatus('reconnecting');
    const delay = Math.min(500 * 2 ** this.reconnectAttempt, 15_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        const refreshedUrl = await this.options.reauthenticate();
        if (refreshedUrl) this.updateUrl(refreshedUrl);
      } catch {
        // ignore — try current token
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
