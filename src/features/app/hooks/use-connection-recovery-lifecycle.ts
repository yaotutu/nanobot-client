import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, type RefObject } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  shouldReconnectOnForeground,
  type ReconnectReason,
} from '@/features/connection/connection-recovery-policy';
import type { NanobotSocket } from '@/features/connection/socket-transport';
import { useConnectionStore } from '@/features/connection/store';

function networkIsAvailable(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function useConnectionRecoveryLifecycle(
  socketRef: RefObject<NanobotSocket | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let foregroundCheckId = 0;
    let previousAppState: AppStateStatus = AppState.currentState;
    let backgroundedAt: number | null = previousAppState === 'active' ? null : Date.now();
    let previousNetworkAvailable: boolean | null = null;

    const reconnect = (reason: ReconnectReason) => {
      const socket = socketRef.current;
      if (!socket) return;
      const connection = useConnectionStore.getState();
      connection.setReconnectReason(reason);
      connection.setLastError(null);
      void socket.reconnectNow().catch((caught: unknown) => {
        const message = caught instanceof Error ? caught.message : 'connection_recovery_failed';
        useConnectionStore.getState().setLastError(message);
      });
    };

    const applyNetworkState = (state: NetInfoState): {
      available: boolean;
      restored: boolean;
    } => {
      const available = networkIsAvailable(state);
      const restored = previousNetworkAvailable === false && available;
      previousNetworkAvailable = available;
      useConnectionStore.getState().setNetworkAvailable(available);
      socketRef.current?.setNetworkAvailable(available);
      return { available, restored };
    };

    const recoverOnForeground = async (
      backgroundDurationMs: number,
      checkId: number,
      expectedSocket: NanobotSocket | null,
    ) => {
      let networkState: NetInfoState;
      try {
        networkState = await NetInfo.fetch();
      } catch {
        return;
      }
      if (
        disposed
        || checkId !== foregroundCheckId
        || AppState.currentState !== 'active'
        || socketRef.current !== expectedSocket
      ) return;

      const { available, restored } = applyNetworkState(networkState);
      if (!available) return;

      const now = Date.now();
      const connection = useConnectionStore.getState();
      const activityAge = connection.lastActivityAt === null
        ? Number.POSITIVE_INFINITY
        : now - connection.lastActivityAt;
      if (restored) {
        reconnect('network-restored');
      } else if (shouldReconnectOnForeground({
        networkAvailable: true,
        status: expectedSocket?.getStatus() ?? 'closed',
        backgroundDurationMs,
        activityAgeMs: activityAge,
      })) {
        reconnect('foreground');
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = previousAppState === 'active';
      previousAppState = nextState;
      if (nextState !== 'active') {
        foregroundCheckId += 1;
        if (wasActive) backgroundedAt = Date.now();
        return;
      }

      const now = Date.now();
      const backgroundDuration = backgroundedAt === null ? 0 : now - backgroundedAt;
      backgroundedAt = null;
      const checkId = ++foregroundCheckId;
      void recoverOnForeground(backgroundDuration, checkId, socketRef.current);
    });

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const { restored } = applyNetworkState(state);
      if (restored && AppState.currentState === 'active') {
        reconnect('network-restored');
      }
    });

    return () => {
      disposed = true;
      foregroundCheckId += 1;
      appStateSubscription.remove();
      unsubscribeNetInfo();
    };
  }, [enabled, socketRef]);
}
