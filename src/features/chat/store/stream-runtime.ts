import type { InboundEvent } from '@/types/api/chat/events';
import type { UIMessage } from '@/types/api/chat/messages';

import {
  appendSideChannelMessage,
  createStreamFoldState,
  foldStreamEvent,
  resetStreamFoldState,
  STREAM_END_IDLE_DELAY_MS,
  type StreamFoldState,
} from '../stream-fold';

export class ChatStreamRuntime {
  private readonly foldState: StreamFoldState = createStreamFoldState();
  private pendingEvents: InboundEvent[] = [];
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private streamEndTimer: ReturnType<typeof setTimeout> | null = null;

  get suppressesStream(): boolean {
    return this.foldState.suppressStreamUntilTurnEnd;
  }

  appendSideChannel(
    messages: UIMessage[],
    event: Extract<InboundEvent, { event: 'message' }>,
  ): UIMessage[] {
    return appendSideChannelMessage(messages, event, this.foldState);
  }

  fold(messages: UIMessage[], event: InboundEvent): UIMessage[] {
    return foldStreamEvent(messages, event, this.foldState);
  }

  enqueue(event: InboundEvent, flush: (events: InboundEvent[]) => void): void {
    this.pendingEvents.push(event);
    if (this.pendingTimer) return;
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      const pending = this.drainPending();
      if (pending.length) flush(pending);
    }, 16);
  }

  drainPending(): InboundEvent[] {
    const pending = this.pendingEvents;
    this.pendingEvents = [];
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    return pending;
  }

  foldPending(messages: UIMessage[]): UIMessage[] {
    return this.drainPending().reduce(
      (next, event) => this.fold(next, event),
      messages,
    );
  }

  cancelStreamEnd(): void {
    if (!this.streamEndTimer) return;
    clearTimeout(this.streamEndTimer);
    this.streamEndTimer = null;
  }

  scheduleStreamEnd(callback: () => void): void {
    this.cancelStreamEnd();
    this.streamEndTimer = setTimeout(() => {
      this.streamEndTimer = null;
      callback();
    }, STREAM_END_IDLE_DELAY_MS);
  }

  prepareTurn(): void {
    resetStreamFoldState(this.foldState);
  }

  reset(): void {
    this.drainPending();
    this.cancelStreamEnd();
    this.prepareTurn();
  }
}
