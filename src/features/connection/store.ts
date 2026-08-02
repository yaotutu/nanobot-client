import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { ConnectionStatus } from '@/types/api/runtime';

interface ConnectionState {
  status: ConnectionStatus;
  hasOpenedSocket: boolean;
  /** 重连后是否需要重新拉一次 canonical history */
  needsCanonicalReconnect: boolean;
}

interface ConnectionActions {
  setStatus(status: ConnectionStatus): void;
  markOpened(): void;
  markReconnectNeeded(): void;
  clearReconnectNeeded(): void;
}

export type ConnectionStore = ConnectionState & ConnectionActions;

export const useConnectionStore = create<ConnectionStore>()(
  subscribeWithSelector((set) => ({
    status: 'idle',
    hasOpenedSocket: false,
    needsCanonicalReconnect: false,

    setStatus(status) {
      set({ status });
    },

    markOpened() {
      set({ hasOpenedSocket: true });
    },

    markReconnectNeeded() {
      set({ needsCanonicalReconnect: true });
    },

    clearReconnectNeeded() {
      set({ needsCanonicalReconnect: false });
    },
  })),
);
