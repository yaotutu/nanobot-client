import { useCallback, useState } from 'react';

/** 抽屉、搜索和偏好均为临时弹窗；聊天始终保留在主界面。 */
export function useAppNavigation() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
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
    setChatResetRevision((current) => current + 1);
  }, []);
  return {
    chatResetRevision, drawerOpen, sessionSearchOpen, preferencesOpen,
    setDrawerOpen, setSessionSearchOpen, setPreferencesOpen,
    openPreferences, openSearch, resetChat,
  };
}
