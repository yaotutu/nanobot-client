import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { ConnectionStatus, StreamError } from '@/types/api';

export type TransportError = StreamError;

interface ConnectionState {
  status: ConnectionStatus;
  hasOpenedSocket: boolean;
  /** 重连后是否需要重新拉一次 canonical history */
  needsCanonicalReconnect: boolean;
  /** 上次 stream error（按 chat 维度由 chat store 管理；这里只放全局 transport error） */
  globalTransportError: TransportError | null;
}

interface ConnectionActions {
  setStatus(status: ConnectionStatus): void;
  markOpened(): void;
  markReconnectNeeded(): void;
  clearReconnectNeeded(): void;
  setGlobalTransportError(error: TransportError | null): void;
}

export type ConnectionStore = ConnectionState & ConnectionActions;

export const useConnectionStore = create<ConnectionStore>()(
  subscribeWithSelector((set) => ({
    status: 'idle',
    hasOpenedSocket: false,
    needsCanonicalReconnect: false,
    globalTransportError: null,

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

    setGlobalTransportError(error) {
      set({ globalTransportError: error });
    },
  })),
);

/** 派生 selector：连接是否处于可用状态 */
export const selectIsConnected = (s: ConnectionStore) => s.status === 'open';
