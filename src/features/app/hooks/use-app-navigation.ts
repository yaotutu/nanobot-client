import { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

import type { AppUtilityView } from '@/features/app/model/navigation';

export function useAppNavigation() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [utilityView, setUtilityView] = useState<AppUtilityView>('chat');
  const [chatResetRevision, setChatResetRevision] = useState(0);

  useEffect(() => {
    if (utilityView === 'chat') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setUtilityView('chat');
      return true;
    });
    return () => subscription.remove();
  }, [utilityView]);

  const openUtility = useCallback((view: Exclude<AppUtilityView, 'chat'>) => {
    setUtilityView(view);
    setDrawerOpen(false);
  }, []);

  const openSearch = useCallback(() => {
    setDrawerOpen(false);
    setSessionSearchOpen(true);
  }, []);

  const returnToChat = useCallback(() => {
    setUtilityView('chat');
  }, []);

  const resetChat = useCallback(() => {
    setUtilityView('chat');
    setDrawerOpen(false);
    setSessionSearchOpen(false);
    setChatResetRevision((current) => current + 1);
  }, []);

  return {
    chatResetRevision,
    drawerOpen,
    openSearch,
    openUtility,
    resetChat,
    returnToChat,
    sessionSearchOpen,
    setDrawerOpen,
    setSessionSearchOpen,
    utilityView,
  };
}
