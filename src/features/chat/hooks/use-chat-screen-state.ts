import { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

import type { UtilityView } from '@/features/chat/components/UtilityViewRouter';

export function useChatScreenState() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [utilityView, setUtilityView] = useState<UtilityView>('chat');
  const [assistantQuoteSource, setAssistantQuoteSource] = useState<string | null>(null);
  const [promptNavigatorOpen, setPromptNavigatorOpen] = useState(false);
  const [sessionInfoOpen, setSessionInfoOpen] = useState(false);
  const [filePreviewPath, setFilePreviewPath] = useState<string | null>(null);

  useEffect(() => {
    if (utilityView === 'chat') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setUtilityView('chat');
      return true;
    });
    return () => subscription.remove();
  }, [utilityView]);

  const resetForSessionChange = useCallback(() => {
    setUtilityView('chat');
    setPromptNavigatorOpen(false);
    setSessionInfoOpen(false);
    setAssistantQuoteSource(null);
    setFilePreviewPath(null);
  }, []);

  const openUtility = useCallback((view: Exclude<UtilityView, 'chat'>) => {
    setUtilityView(view);
    setDrawerOpen(false);
  }, []);

  const openSearch = useCallback(() => {
    setDrawerOpen(false);
    setSessionSearchOpen(true);
  }, []);

  return {
    drawerOpen,
    sessionSearchOpen,
    utilityView,
    assistantQuoteSource,
    promptNavigatorOpen,
    sessionInfoOpen,
    filePreviewPath,
    setDrawerOpen,
    setSessionSearchOpen,
    setUtilityView,
    setAssistantQuoteSource,
    setPromptNavigatorOpen,
    setSessionInfoOpen,
    setFilePreviewPath,
    resetForSessionChange,
    openUtility,
    openSearch,
  };
}
