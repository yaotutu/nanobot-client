import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';

import { useReadyDataLifecycle } from '@/features/app/hooks/use-ready-data-lifecycle';
import type { BootstrapResponse } from '@/types/api/runtime';

const mockRefreshBootstrap = jest.fn(async () => mockAuthState.bootstrap as BootstrapResponse);
const mockRefreshSessions = jest.fn(async () => undefined);
const mockRefreshSidebarState = jest.fn(async () => undefined);
const mockRefreshCapabilities = jest.fn(async () => undefined);
const mockRefreshSkills = jest.fn(async () => undefined);
const mockRefreshWorkspaces = jest.fn(async () => undefined);

const mockAuthState = {
  phase: 'ready' as const,
  bootstrap: {
    token: 'ws-token-1',
    api_token: 'api-token-1',
    ws_path: '/ws',
    expires_in: 600,
  } as BootstrapResponse,
  sessionEpoch: 1,
  tokenGeneration: 1,
  refreshBootstrap: mockRefreshBootstrap,
};

const mockConnectionState = { networkAvailable: true };

jest.mock('@/features/auth/store', () => ({
  selectAuthPhase: (state: typeof mockAuthState) => state.phase,
  selectBootstrap: (state: typeof mockAuthState) => state.bootstrap,
  selectAuthSessionEpoch: (state: typeof mockAuthState) => state.sessionEpoch,
  selectTokenGeneration: (state: typeof mockAuthState) => state.tokenGeneration,
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock('@/features/connection/store', () => ({
  useConnectionStore: Object.assign(
    (selector: (state: typeof mockConnectionState) => unknown) => selector(mockConnectionState),
    { getState: () => mockConnectionState },
  ),
}));

jest.mock('@/features/sidebar/store', () => ({
  useSidebarStore: (selector: (state: unknown) => unknown) => selector({
    refresh: mockRefreshSessions,
    refreshSidebarState: mockRefreshSidebarState,
  }),
}));

jest.mock('@/features/capabilities/store', () => ({
  useCapabilitiesStore: (selector: (state: unknown) => unknown) => selector({
    refreshAll: mockRefreshCapabilities,
  }),
}));

jest.mock('@/features/skills/store', () => ({
  useSkillsStore: (selector: (state: unknown) => unknown) => selector({ refresh: mockRefreshSkills }),
}));

jest.mock('@/features/workspaces/store', () => ({
  useWorkspacesStore: (selector: (state: unknown) => unknown) => selector({
    refresh: mockRefreshWorkspaces,
  }),
}));

describe('useReadyDataLifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    mockAuthState.phase = 'ready';
    mockAuthState.sessionEpoch = 1;
    mockAuthState.tokenGeneration = 1;
    mockAuthState.bootstrap = {
      token: 'ws-token-1',
      api_token: 'api-token-1',
      ws_path: '/ws',
      expires_in: 600,
    } as BootstrapResponse;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('首帧后刷新会话、空闲时刷新目录，令牌续期不会重复刷新目录', async () => {
    const { rerender } = await renderHook(() => useReadyDataLifecycle());

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(mockRefreshSessions).toHaveBeenCalledTimes(1);
    expect(mockRefreshSidebarState).toHaveBeenCalledTimes(1);
    expect(mockRefreshCapabilities).toHaveBeenCalledTimes(1);
    expect(mockRefreshSkills).toHaveBeenCalledTimes(1);
    expect(mockRefreshWorkspaces).toHaveBeenCalledTimes(1);

    mockAuthState.tokenGeneration += 1;
    mockAuthState.bootstrap = {
      ...mockAuthState.bootstrap,
      token: 'ws-token-2',
      api_token: 'api-token-2',
    };
    await rerender(undefined);

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(mockRefreshSessions).toHaveBeenCalledTimes(1);
    expect(mockRefreshSidebarState).toHaveBeenCalledTimes(1);
    expect(mockRefreshCapabilities).toHaveBeenCalledTimes(1);
    expect(mockRefreshSkills).toHaveBeenCalledTimes(1);
    expect(mockRefreshWorkspaces).toHaveBeenCalledTimes(1);
  });
});
