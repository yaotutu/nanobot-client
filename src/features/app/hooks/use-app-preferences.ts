import { useCallback, useEffect } from 'react';

import { setAppLanguage } from '@/i18n';
import { normalizeLocale } from '@/i18n/config';
import {
  selectPreferences,
  selectPreferencesHydrated,
  useLocalPreferencesStore,
  type LocalPreferences,
} from '@/stores/local-preferences-store';

export function useAppPreferences() {
  const preferences = useLocalPreferencesStore(selectPreferences);
  const hydrated = useLocalPreferencesStore(selectPreferencesHydrated);
  const hydrate = useLocalPreferencesStore((state) => state.hydrate);
  const replace = useLocalPreferencesStore((state) => state.replace);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  const changePreferences = useCallback((next: LocalPreferences) => {
    replace(next);
    void setAppLanguage(normalizeLocale(next.language));
  }, [replace]);

  // 服务器切换由 LocalPreferences.normalize 清空默认会话，避免不同网关的会话 ID 混用。
  const changeServerUrl = useCallback((serverUrl: string) => {
    useLocalPreferencesStore.getState().update({ serverUrl, serverConfigured: true });
  }, []);

  const changeDefaultSession = useCallback((sessionKey: string | null) => {
    useLocalPreferencesStore.getState().update({
      defaultSessionKey: sessionKey,
      defaultSessionServerUrl: sessionKey ? preferences.serverUrl : '',
    });
  }, [preferences.serverUrl]);

  return { changeDefaultSession, changePreferences, changeServerUrl, preferences };
}
