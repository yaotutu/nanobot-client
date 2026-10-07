import { useCallback, useState } from 'react';
import { Keyboard } from 'react-native';

/** 会话面板、搜索、偏好和会话选项均为临时弹窗；聊天始终保留在主界面。 */
export function useAppNavigation() {
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const openConversations = useCallback(() => {
    // 展示历史会话不等于切换会话：仅收起键盘，保留当前输入框与草稿。
    Keyboard.dismiss();
    setChatOptionsOpen(false);
    setConversationsOpen(true);
  }, []);
  const openChatOptions = useCallback(() => {
    // 只切换临时视图，不能调用 resetChat，否则会清空正在编辑的草稿。
    Keyboard.dismiss();
    setConversationsOpen(false);
    setChatOptionsOpen(true);
  }, []);
  const [chatResetRevision, setChatResetRevision] = useState(0);
  const openPreferences = useCallback(() => {
    setConversationsOpen(false);
    setPreferencesOpen(true);
  }, []);
  const openSearch = useCallback(() => {
    setConversationsOpen(false);
    setSessionSearchOpen(true);
  }, []);
  const resetChat = useCallback(() => {
    setConversationsOpen(false);
    setSessionSearchOpen(false);
    setPreferencesOpen(false);
    setChatOptionsOpen(false);
    setChatResetRevision((current) => current + 1);
  }, []);
  return {
    chatResetRevision, conversationsOpen, sessionSearchOpen, preferencesOpen, chatOptionsOpen,
    setConversationsOpen, setSessionSearchOpen, setPreferencesOpen, setChatOptionsOpen,
    openConversations, openPreferences, openSearch, openChatOptions, resetChat,
  };
}
