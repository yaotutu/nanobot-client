import type { OutboundFrame } from '@/features/connection/socket-protocol';

export interface QueuedOutboundFrame {
  id: string;
  frame: OutboundFrame;
}

/**
 * Stores frames that have not yet been handed to WebSocket.send(). Entries are
 * removed only after send succeeds, or when their owning request settles.
 */
export class SocketOutboundQueue {
  private entries: QueuedOutboundFrame[] = [];
  private sequence = 0;

  createId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}:${this.sequence}`;
  }

  enqueue(id: string, frame: OutboundFrame): void {
    this.remove(id);
    this.entries.push({ id, frame });
  }

  remove(id: string): void {
    this.entries = this.entries.filter((entry) => entry.id !== id);
  }

  clear(): void {
    this.entries = [];
  }

  flush(send: (frame: OutboundFrame) => boolean): void {
    for (const entry of [...this.entries]) {
      if (!send(entry.frame)) break;
      this.remove(entry.id);
    }
  }
}
