import { SocketDeliveryUnknownError } from '@/features/connection/socket-errors';
import type { MessageSendResult } from '@/features/connection/socket-protocol';

type DeliveryState = 'queued' | 'sent';
type SettledCallback = () => void;

interface PendingMessageSend {
  chatId: string;
  turnId: string;
  startsNewRun: boolean;
  deliveryState: DeliveryState;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  onSettled?: SettledCallback;
}

interface TimedPending<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  onSettled?: SettledCallback;
}

function runSendKey(chatId: string, turnId: string): string {
  return `${chatId}:${turnId}`;
}

function finish(callback?: SettledCallback): void {
  try {
    callback?.();
  } catch {
    // Request cleanup must not interfere with promise settlement.
  }
}

export class SocketPendingRegistry {
  private messageSends = new Map<string, PendingMessageSend>();
  private systemCommands = new Map<string, TimedPending<void>>();
  private transcriptions = new Map<string, TimedPending<string>>();
  private newChat: TimedPending<string> | null = null;

  hasNewChat(): boolean {
    return this.newChat !== null;
  }

  createNewChat(timeoutMs: number, timeoutMessage: string, onSettled?: SettledCallback): Promise<string> {
    if (this.newChat) return Promise.reject(new Error('newChat already in flight'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.newChat;
        this.newChat = null;
        finish(pending?.onSettled);
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      this.newChat = { resolve, reject, timer, onSettled };
    });
  }

  resolveNewChat(chatId: string): void {
    const pending = this.newChat;
    if (!pending) return;
    this.newChat = null;
    clearTimeout(pending.timer);
    finish(pending.onSettled);
    pending.resolve(chatId);
  }

  rejectNewChat(error: Error): void {
    const pending = this.newChat;
    if (!pending) return;
    this.newChat = null;
    clearTimeout(pending.timer);
    finish(pending.onSettled);
    pending.reject(error);
  }

  createMessageSend(
    chatId: string,
    turnId: string,
    startsNewRun: boolean,
    timeoutMs: number,
    onSettled?: SettledCallback,
  ): MessageSendResult {
    let resolveAccepted!: () => void;
    let rejectAccepted!: (error: Error) => void;
    const accepted = new Promise<void>((resolve, reject) => {
      resolveAccepted = resolve;
      rejectAccepted = reject;
    });
    const key = runSendKey(chatId, turnId);
    const timer = setTimeout(() => {
      const pending = this.messageSends.get(key);
      if (!pending) return;
      this.messageSends.delete(key);
      finish(pending.onSettled);
      pending.reject(new Error('message_accept_timeout'));
    }, timeoutMs);
    this.messageSends.set(key, {
      chatId,
      turnId,
      startsNewRun,
      deliveryState: 'queued',
      resolve: resolveAccepted,
      reject: rejectAccepted,
      timer,
      onSettled,
    });
    return { turnId, accepted };
  }

  markMessageSent(chatId: string, turnId: string): void {
    const pending = this.messageSends.get(runSendKey(chatId, turnId));
    if (pending) pending.deliveryState = 'sent';
  }

  rejectMessage(chatId: string, turnId: string, error: Error): void {
    this.settleMessage(runSendKey(chatId, turnId), 'reject', error);
  }

  acceptMessage(chatId: string, turnId: string): void {
    this.settleMessage(runSendKey(chatId, turnId), 'resolve');
  }

  acceptFallback(chatId: string, startsNewRun?: boolean): void {
    for (const [key, pending] of this.messageSends) {
      if (pending.chatId !== chatId) continue;
      if (startsNewRun !== undefined && pending.startsNewRun !== startsNewRun) continue;
      this.settleMessage(key, 'resolve');
      return;
    }
  }

  rejectMessagesOnClose(queuedError: Error, sentError: Error = new SocketDeliveryUnknownError()): void {
    for (const [key, pending] of [...this.messageSends]) {
      const error = pending.deliveryState === 'sent' ? sentError : queuedError;
      this.settleMessage(key, 'reject', error);
    }
  }

  createSystemCommand(turnId: string, timeoutMs: number, onSettled?: SettledCallback): Promise<void> {
    return this.createTimed(this.systemCommands, turnId, timeoutMs, 'system command timeout', onSettled);
  }

  resolveSystemCommand(turnId: string): void {
    this.resolveTimed(this.systemCommands, turnId, undefined);
  }

  rejectSystemCommand(turnId: string, error: Error): void {
    this.rejectTimed(this.systemCommands, turnId, error);
  }

  createTranscription(requestId: string, timeoutMs: number, onSettled?: SettledCallback): Promise<string> {
    return this.createTimed(this.transcriptions, requestId, timeoutMs, 'transcription_timeout', onSettled);
  }

  resolveTranscription(requestId: string, text: string): void {
    this.resolveTimed(this.transcriptions, requestId, text);
  }

  rejectTranscription(requestId?: string, detail?: string): void {
    const error = new Error(detail || 'transcription_failed');
    if (!requestId) {
      for (const key of [...this.transcriptions.keys()]) this.rejectTimed(this.transcriptions, key, error);
      return;
    }
    this.rejectTimed(this.transcriptions, requestId, error);
  }

  rejectTransientRequests(error: Error): void {
    for (const key of [...this.systemCommands.keys()]) this.rejectTimed(this.systemCommands, key, error);
    for (const key of [...this.transcriptions.keys()]) this.rejectTimed(this.transcriptions, key, error);
  }

  private settleMessage(key: string, outcome: 'resolve' | 'reject', error?: Error): void {
    const pending = this.messageSends.get(key);
    if (!pending) return;
    this.messageSends.delete(key);
    clearTimeout(pending.timer);
    finish(pending.onSettled);
    if (outcome === 'resolve') pending.resolve();
    else pending.reject(error ?? new Error('message_rejected'));
  }

  private createTimed<T>(
    map: Map<string, TimedPending<T>>,
    key: string,
    timeoutMs: number,
    message: string,
    onSettled?: SettledCallback,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = map.get(key);
        map.delete(key);
        finish(pending?.onSettled);
        reject(new Error(message));
      }, timeoutMs);
      map.set(key, { resolve, reject, timer, onSettled });
    });
  }

  private resolveTimed<T>(map: Map<string, TimedPending<T>>, key: string, value: T): void {
    const pending = map.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    map.delete(key);
    finish(pending.onSettled);
    pending.resolve(value);
  }

  private rejectTimed<T>(map: Map<string, TimedPending<T>>, key: string, error: Error): void {
    const pending = map.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    map.delete(key);
    finish(pending.onSettled);
    pending.reject(error);
  }
}
