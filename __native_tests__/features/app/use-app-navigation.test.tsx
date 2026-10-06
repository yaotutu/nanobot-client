import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import { useAppNavigation } from '@/features/app/hooks/use-app-navigation';

describe('聊天弹窗导航', () => {
  it('打开偏好或搜索时关闭抽屉，不重置聊天', async () => {
    const { result } = await renderHook(() => useAppNavigation());
    await act(async () => result.current.setDrawerOpen(true));
    await act(async () => result.current.openPreferences());
    expect(result.current.drawerOpen).toBe(false);
    expect(result.current.preferencesOpen).toBe(true);
    expect(result.current.chatResetRevision).toBe(0);
    await act(async () => result.current.setPreferencesOpen(false));
    await act(async () => result.current.openSearch());
    expect(result.current.sessionSearchOpen).toBe(true);
    expect(result.current.chatResetRevision).toBe(0);
  });

  it('切换会话时关闭全部弹窗，递增聊天重置代次', async () => {
    const { result } = await renderHook(() => useAppNavigation());
    await act(async () => {
      result.current.setDrawerOpen(true);
      result.current.setSessionSearchOpen(true);
      result.current.setPreferencesOpen(true);
    });
    await act(async () => result.current.resetChat());
    expect(result.current).toMatchObject({
      drawerOpen: false, sessionSearchOpen: false, preferencesOpen: false, chatResetRevision: 1,
    });
  });
});
