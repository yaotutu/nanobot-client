import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useAuthBootstrapLifecycle } from '@/features/app/hooks/use-auth-bootstrap-lifecycle';
import type { LocalPreferences } from '@/stores/local-preferences-store';

const mockBootstrapFromStorage = jest.fn(async () => undefined);
const mockLogout = jest.fn(async () => undefined);
const mockAuthState = { bootstrapFromStorage: mockBootstrapFromStorage, logout: mockLogout };
const createPreferences = (serverConfigured: boolean): LocalPreferences => ({
  theme: 'light',
  language: 'en',
  serverUrl: 'http://example.test:8765',
  serverConfigured,
});
let mockPreferenceState = {
  preferences: createPreferences(true),
  hydrated: true,
};

jest.mock('@/features/auth/store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
    { getState: () => mockAuthState },
  ),
}));

jest.mock('@/stores/local-preferences-store', () => ({
  selectPreferencesHydrated: (state: typeof mockPreferenceState) => state.hydrated,
  useLocalPreferencesStore: Object.assign(
    (selector: (state: typeof mockPreferenceState) => unknown) => selector(mockPreferenceState),
    { },
  ),
}));

describe('useAuthBootstrapLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceState = { preferences: createPreferences(true), hydrated: true };
  });

  it('只在启动壳首次挂载时恢复一次本地鉴权状态', async () => {
    const { rerender } = await renderHook(() => useAuthBootstrapLifecycle());

    await waitFor(() => expect(mockBootstrapFromStorage).toHaveBeenCalledTimes(1));
    rerender(undefined);
    expect(mockBootstrapFromStorage).toHaveBeenCalledTimes(1);
  });

  it('等待偏好恢复完成；服务器尚未配置时不自动登录，并清理旧密码进入服务器配置页', async () => {
    mockPreferenceState = { preferences: createPreferences(false), hydrated: false };
    const { rerender } = await renderHook(() => useAuthBootstrapLifecycle());

    // SecureStore 尚未恢复前不能决策，避免先用默认地址或旧密码触发自动登录。
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockBootstrapFromStorage).not.toHaveBeenCalled();

    mockPreferenceState = { preferences: createPreferences(false), hydrated: true };
    await act(async () => {
      rerender(undefined);
    });
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    expect(mockBootstrapFromStorage).not.toHaveBeenCalled();
  });
});
