import type { InboundEvent } from '@/types/api/chat/events';
import type { StreamError } from '@/types/api/chat/errors';
import type { ConnectionStatus } from '@/types/api/runtime';
import type {
  EventListener,
  RunStatusListener,
  StatusListener,
  TransportErrorListener,
} from '@/features/connection/socket-protocol';

export class SocketListeners {
  private status: ConnectionStatus = 'idle';
  private statusListeners = new Set<StatusListener>();
  private eventListeners = new Set<EventListener>();
  private runStatusListeners = new Set<RunStatusListener>();
  private transportErrorListeners = new Set<TransportErrorListener>();
  private runStartedAtByChatId = new Map<string, number>();

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
    for (const [chatId, startedAt] of this.runStartedAtByChatId) listener(chatId, startedAt);
    return () => this.runStatusListeners.delete(listener);
  }

  onTransportError(listener: TransportErrorListener): () => void {
    this.transportErrorListeners.add(listener);
    return () => this.transportErrorListeners.delete(listener);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit(this.statusListeners, status);
  }

  emitEvent(event: InboundEvent): void {
    this.emit(this.eventListeners, event);
  }

  setRunStatus(chatId: string, startedAt: number): void {
    this.runStartedAtByChatId.set(chatId, startedAt);
    this.emitRunStatus(chatId, startedAt);
  }

  clearRunStatus(chatId: string): void {
    if (!this.runStartedAtByChatId.delete(chatId)) return;
    this.emitRunStatus(chatId, null);
  }

  emitTransportError(error: StreamError): void {
    this.emit(this.transportErrorListeners, error);
  }

  private emit<T>(listeners: Set<(value: T) => void>, value: T): void {
    for (const listener of listeners) {
      try { listener(value); } catch { /* listener failures are isolated */ }
    }
  }

  private emitRunStatus(chatId: string, startedAt: number | null): void {
    for (const listener of this.runStatusListeners) {
      try { listener(chatId, startedAt); } catch { /* listener failures are isolated */ }
    }
  }
}
