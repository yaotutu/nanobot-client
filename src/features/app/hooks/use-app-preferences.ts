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

  return { preferences, changePreferences };
}
