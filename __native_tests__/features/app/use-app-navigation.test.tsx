import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Keyboard } from 'react-native';

import { useAppNavigation } from '@/features/app/hooks/use-app-navigation';

describe('聊天弹窗导航', () => {
  it('会话页打开聊天选项时收起键盘与其他遮挡，但不重置聊天草稿', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const { result } = await renderHook(() => useAppNavigation());
    await act(async () => result.current.setDrawerOpen(true));
    await act(async () => result.current.openChatOptions());
    expect(result.current.drawerOpen).toBe(false);
    expect(result.current.chatOptionsOpen).toBe(true);
    expect(result.current.chatResetRevision).toBe(0);
    expect(dismiss).toHaveBeenCalledTimes(1);
    await act(async () => result.current.setChatOptionsOpen(false));
    expect(result.current.chatOptionsOpen).toBe(false);
    dismiss.mockRestore();
  });

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
      result.current.setChatOptionsOpen(true);
    });
    await act(async () => result.current.resetChat());
    expect(result.current).toMatchObject({
      drawerOpen: false, sessionSearchOpen: false, preferencesOpen: false, chatOptionsOpen: false, chatResetRevision: 1,
    });
  });
});
