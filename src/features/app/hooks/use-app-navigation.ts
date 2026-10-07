import { useCallback, useState } from 'react';
import { Keyboard } from 'react-native';

/** 抽屉、搜索、偏好和会话选项均为临时弹窗；聊天始终保留在主界面。 */
export function useAppNavigation() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const openChatOptions = useCallback(() => {
    // 只切换临时视图，不能调用 resetChat，否则会清空正在编辑的草稿。
    Keyboard.dismiss();
    setDrawerOpen(false);
    setChatOptionsOpen(true);
  }, []);
  const [chatResetRevision, setChatResetRevision] = useState(0);
  const openPreferences = useCallback(() => {
    setDrawerOpen(false);
    setPreferencesOpen(true);
  }, []);
  const openSearch = useCallback(() => {
    setDrawerOpen(false);
    setSessionSearchOpen(true);
  }, []);
  const resetChat = useCallback(() => {
    setDrawerOpen(false);
    setSessionSearchOpen(false);
    setPreferencesOpen(false);
    setChatOptionsOpen(false);
    setChatResetRevision((current) => current + 1);
  }, []);
  return {
    chatResetRevision, drawerOpen, sessionSearchOpen, preferencesOpen, chatOptionsOpen,
    setDrawerOpen, setSessionSearchOpen, setPreferencesOpen, setChatOptionsOpen,
    openPreferences, openSearch, openChatOptions, resetChat,
  };
}
