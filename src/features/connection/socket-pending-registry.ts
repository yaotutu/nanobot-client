import type { MessageSendResult } from '@/features/connection/socket-protocol';

interface PendingMessageSend {
  chatId: string;
  turnId: string;
  startsNewRun: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
  acceptanceSettled: boolean;
}

interface TimedPending<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function runSendKey(chatId: string, turnId: string): string {
  return `${chatId}:${turnId}`;
}

export class SocketPendingRegistry {
  private messageSends = new Map<string, PendingMessageSend>();
  private systemCommands = new Map<string, TimedPending<void>>();
  private transcriptions = new Map<string, TimedPending<string>>();
  private newChat: TimedPending<string> | null = null;

  hasNewChat(): boolean {
    return this.newChat !== null;
  }

  createNewChat(timeoutMs: number, timeoutMessage: string): Promise<string> {
    if (this.newChat) return Promise.reject(new Error('newChat already in flight'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.newChat = null;
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      this.newChat = { resolve, reject, timer };
    });
  }

  resolveNewChat(chatId: string): void {
    if (!this.newChat) return;
    clearTimeout(this.newChat.timer);
    this.newChat.resolve(chatId);
    this.newChat = null;
  }

  rejectNewChat(error: Error): void {
    if (!this.newChat) return;
    clearTimeout(this.newChat.timer);
    this.newChat.reject(error);
    this.newChat = null;
  }

  createMessageSend(chatId: string, turnId: string, startsNewRun: boolean): MessageSendResult {
    let resolveAccepted!: () => void;
    let rejectAccepted!: (error: Error) => void;
    const accepted = new Promise<void>((resolve, reject) => {
      resolveAccepted = resolve;
      rejectAccepted = reject;
    });
    this.messageSends.set(runSendKey(chatId, turnId), {
      chatId,
      turnId,
      startsNewRun,
      resolve: resolveAccepted,
      reject: rejectAccepted,
      acceptanceSettled: false,
    });
    return { turnId, accepted };
  }

  rejectMessage(chatId: string, turnId: string, error: Error): void {
    const key = runSendKey(chatId, turnId);
    const pending = this.messageSends.get(key);
    if (!pending) return;
    if (!pending.acceptanceSettled) {
      pending.acceptanceSettled = true;
      pending.reject(error);
    }
    this.messageSends.delete(key);
  }

  acceptMessage(chatId: string, turnId: string): void {
    const pending = this.messageSends.get(runSendKey(chatId, turnId));
    if (!pending || pending.acceptanceSettled) return;
    pending.acceptanceSettled = true;
    pending.resolve();
  }

  acceptFallback(chatId: string, startsNewRun?: boolean): void {
    for (const pending of this.messageSends.values()) {
      if (pending.chatId !== chatId || pending.acceptanceSettled) continue;
      if (startsNewRun !== undefined && pending.startsNewRun !== startsNewRun) continue;
      pending.acceptanceSettled = true;
      pending.resolve();
      return;
    }
  }

  rejectMessagesOnClose(error: Error): void {
    for (const pending of this.messageSends.values()) {
      if (!pending.acceptanceSettled) {
        pending.acceptanceSettled = true;
        pending.reject(error);
      }
    }
    this.messageSends.clear();
  }

  createSystemCommand(turnId: string, timeoutMs: number): Promise<void> {
    return this.createTimed(this.systemCommands, turnId, timeoutMs, 'system command timeout');
  }

  resolveSystemCommand(turnId: string): void {
    this.resolveTimed(this.systemCommands, turnId, undefined);
  }

  rejectSystemCommand(turnId: string, error: Error): void {
    this.rejectTimed(this.systemCommands, turnId, error);
  }

  createTranscription(requestId: string, timeoutMs: number): Promise<string> {
    return this.createTimed(this.transcriptions, requestId, timeoutMs, 'transcription_timeout');
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

  private createTimed<T>(map: Map<string, TimedPending<T>>, key: string, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        map.delete(key);
        reject(new Error(message));
      }, timeoutMs);
      map.set(key, { resolve, reject, timer });
    });
  }

  private resolveTimed<T>(map: Map<string, TimedPending<T>>, key: string, value: T): void {
    const pending = map.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    map.delete(key);
    pending.resolve(value);
  }

  private rejectTimed<T>(map: Map<string, TimedPending<T>>, key: string, error: Error): void {
    const pending = map.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    map.delete(key);
    pending.reject(error);
  }
}
