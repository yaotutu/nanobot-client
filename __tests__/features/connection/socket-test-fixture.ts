import { afterEach, beforeEach, vi } from 'vitest';

import {
  createNanobotSocket,
  type NanobotSocket,
} from '@/features/connection/socket-transport';

export const SENT_FRAMES: string[] = [];

export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];
  static last(): MockWebSocket | undefined {
    return this.instances[this.instances.length - 1];
  }
  static reset(): void {
    this.instances = [];
    SENT_FRAMES.length = 0;
  }

  static sentFrames(): unknown[] {
    return SENT_FRAMES.map((data) => JSON.parse(data));
  }

  readyState = 0;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    SENT_FRAMES.push(data);
  }

  close(code = 1000): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  fireOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  fireMessage(data: string): void {
    this.onmessage?.({ data });
  }

  fireClose(code = 1000): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

export function lastSentFrame(): Record<string, unknown> | undefined {
  const frames = MockWebSocket.sentFrames();
  return frames[frames.length - 1] as Record<string, unknown> | undefined;
}

export function findSentFrame(type: string): Record<string, unknown> | undefined {
  return MockWebSocket.sentFrames().find(
    (frame) => (frame as Record<string, unknown>).type === type,
  ) as Record<string, unknown> | undefined;
}

export function makeSocket(overrides?: Partial<{
  url: string;
  reauthenticate: () => Promise<string | null>;
  maxFrameBytes: number;
}>): NanobotSocket {
  return createNanobotSocket({
    url: overrides?.url ?? 'ws://test',
    reauthenticate: overrides?.reauthenticate ?? (async () => null),
    maxFrameBytes: overrides?.maxFrameBytes,
  });
}

export function setupSocketTestEnvironment(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}
