import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { NetInfoState } from '@react-native-community/netinfo';
import type { AppStateStatus } from 'react-native';

import { useConnectionRecoveryLifecycle } from '@/features/app/hooks/use-connection-recovery-lifecycle';
import type { NanobotSocket } from '@/features/connection';
import type { ConnectionStatus } from '@/types/api/runtime';

const mockNetInfoFetch = jest.fn<() => Promise<NetInfoState>>();
let mockNetInfoListener: ((state: NetInfoState) => void) | null = null;
const mockNetInfoUnsubscribe = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((listener: (state: NetInfoState) => void) => {
      mockNetInfoListener = listener;
      return mockNetInfoUnsubscribe;
    }),
    fetch: () => mockNetInfoFetch(),
  },
}));

let mockCurrentAppState: AppStateStatus = 'active';
let mockAppStateListener: ((state: AppStateStatus) => void) | null = null;
const mockRemoveAppStateListener = jest.fn();

jest.mock('react-native', () => {
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  const appState = {
    get currentState() {
      return mockCurrentAppState;
    },
    addEventListener: jest.fn((_event: string, listener: (state: AppStateStatus) => void) => {
      mockAppStateListener = listener;
      return { remove: mockRemoveAppStateListener };
    }),
  };
  return new Proxy(actual, {
    get(target, property, receiver) {
      if (property === 'AppState') return appState;
      return Reflect.get(target, property, receiver);
    },
  });
});

const mockConnectionState = {
  status: 'open' as ConnectionStatus,
  networkAvailable: true,
  lastActivityAt: 1_000 as number | null,
  reconnectReason: null as string | null,
  lastError: null as string | null,
  setNetworkAvailable: jest.fn((available: boolean) => {
    mockConnectionState.networkAvailable = available;
  }),
  setReconnectReason: jest.fn((reason: string | null) => {
    mockConnectionState.reconnectReason = reason;
  }),
  setLastError: jest.fn((error: string | null) => {
    mockConnectionState.lastError = error;
  }),
};

jest.mock('@/features/connection/connection-recovery-policy', () => ({
  shouldReconnectOnForeground: jest.fn((options: {
    networkAvailable: boolean;
    status: ConnectionStatus;
    backgroundDurationMs: number;
    activityAgeMs: number;
  }) => options.networkAvailable && (
    options.backgroundDurationMs >= 10_000
    || options.status !== 'open'
    || options.activityAgeMs >= 45_000
  )),
}));

jest.mock('@/features/connection/store', () => ({
  useConnectionStore: Object.assign(
    (selector: (state: typeof mockConnectionState) => unknown) => selector(mockConnectionState),
    { getState: () => mockConnectionState },
  ),
}));

function connectedState(available: boolean): NetInfoState {
  return {
    type: available ? 'wifi' : 'none',
    isConnected: available,
    isInternetReachable: available,
    details: null,
  } as NetInfoState;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('useConnectionRecoveryLifecycle', () => {
  const reconnectNow = jest.fn(async () => undefined);
  const setNetworkAvailable = jest.fn();
  const getStatus = jest.fn<() => ConnectionStatus>(() => mockConnectionState.status);
  const socket = { reconnectNow, setNetworkAvailable, getStatus };
  const socketRef = { current: socket as unknown as NanobotSocket };

  beforeEach(() => {
    mockCurrentAppState = 'active';
    mockAppStateListener = null;
    mockNetInfoListener = null;
    mockConnectionState.status = 'open';
    mockConnectionState.networkAvailable = true;
    mockConnectionState.lastActivityAt = Date.now();
    mockConnectionState.reconnectReason = null;
    mockConnectionState.lastError = null;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('propagates offline state and reconnects exactly once when the network returns', async () => {
    await renderHook(() => useConnectionRecoveryLifecycle(socketRef, true));

    await act(async () => { mockNetInfoListener?.(connectedState(false)); });
    expect(mockConnectionState.setNetworkAvailable).toHaveBeenLastCalledWith(false);
    expect(setNetworkAvailable).toHaveBeenLastCalledWith(false);

    await act(async () => { mockNetInfoListener?.(connectedState(true)); });
    expect(mockConnectionState.setNetworkAvailable).toHaveBeenLastCalledWith(true);
    expect(setNetworkAvailable).toHaveBeenLastCalledWith(true);
    expect(mockConnectionState.setReconnectReason).toHaveBeenCalledWith('network-restored');
    expect(reconnectNow).toHaveBeenCalledTimes(1);
  });

  it('checks connectivity and reconnects a stale socket on foreground', async () => {
    mockConnectionState.lastActivityAt = 0;
    mockNetInfoFetch.mockResolvedValue(connectedState(true));
    mockCurrentAppState = 'background';
    const rendered = await renderHook(() => useConnectionRecoveryLifecycle(socketRef, true));
    const listener = mockAppStateListener;
    if (!listener) throw new Error('AppState listener was not registered');

    await act(async () => {
      mockCurrentAppState = 'active';
      listener('active');
      await Promise.resolve();
    });

    expect(mockNetInfoFetch).toHaveBeenCalledTimes(1);
    expect(mockConnectionState.setReconnectReason).toHaveBeenCalledWith('foreground');
    expect(reconnectNow).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it('ignores a foreground network check that completes after cleanup', async () => {
    const request = deferred<NetInfoState>();
    mockNetInfoFetch.mockReturnValue(request.promise);
    mockCurrentAppState = 'background';
    const { unmount } = await renderHook(() => useConnectionRecoveryLifecycle(socketRef, true));
    const listener = mockAppStateListener;
    if (!listener) throw new Error('AppState listener was not registered');

    await act(async () => {
      mockCurrentAppState = 'active';
      listener('active');
    });
    await unmount();
    await act(async () => request.resolve(connectedState(true)));

    expect(reconnectNow).not.toHaveBeenCalled();
    expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
    expect(mockNetInfoUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
