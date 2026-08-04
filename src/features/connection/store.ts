import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { ReconnectReason } from '@/features/connection/connection-recovery-policy';
import type { ConnectionStatus } from '@/types/api/runtime';

interface ConnectionState {
  status: ConnectionStatus;
  networkAvailable: boolean;
  hasOpenedSocket: boolean;
  lastOpenedAt: number | null;
  lastActivityAt: number | null;
  reconnectReason: ReconnectReason | null;
  lastError: string | null;
  /** 重连后是否需要重新拉一次 canonical history */
  needsCanonicalReconnect: boolean;
}

interface ConnectionActions {
  setStatus(status: ConnectionStatus): void;
  setNetworkAvailable(available: boolean): void;
  setReconnectReason(reason: ReconnectReason | null): void;
  setLastError(error: string | null): void;
  markActivity(): void;
  markOpened(): void;
  markReconnectNeeded(): void;
  clearReconnectNeeded(): void;
}

export type ConnectionStore = ConnectionState & ConnectionActions;

export const useConnectionStore = create<ConnectionStore>()(
  subscribeWithSelector((set) => ({
    status: 'idle',
    networkAvailable: true,
    hasOpenedSocket: false,
    lastOpenedAt: null,
    lastActivityAt: null,
    reconnectReason: null,
    lastError: null,
    needsCanonicalReconnect: false,

    setStatus(status) {
      set({ status });
    },

    setNetworkAvailable(networkAvailable) {
      set({ networkAvailable });
    },

    setReconnectReason(reconnectReason) {
      set({ reconnectReason });
    },

    setLastError(lastError) {
      set({ lastError });
    },

    markActivity() {
      set({ lastActivityAt: Date.now() });
    },

    markOpened() {
      const now = Date.now();
      set({
        hasOpenedSocket: true,
        lastOpenedAt: now,
        lastActivityAt: now,
        lastError: null,
      });
    },

    markReconnectNeeded() {
      set({ needsCanonicalReconnect: true });
    },

    clearReconnectNeeded() {
      set({ needsCanonicalReconnect: false, reconnectReason: null });
    },
  })),
);
