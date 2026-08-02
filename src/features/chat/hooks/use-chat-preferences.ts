import { useCallback, useEffect, useState } from 'react';

import { setAppLanguage } from '@/i18n';
import { normalizeLocale } from '@/i18n/config';
import {
  DEFAULT_LOCAL_PREFS,
  readLocalPreferences,
  writeLocalPreferences,
  type LocalPreferences,
} from '@/stores/local-preferences-store';

export function useChatPreferences() {
  const [preferences, setPreferences] = useState<LocalPreferences>(DEFAULT_LOCAL_PREFS);

  useEffect(() => {
    let cancelled = false;
    void readLocalPreferences().then((stored) => {
      if (cancelled) return;
      setPreferences(stored);
      void setAppLanguage(normalizeLocale(stored.language));
    });
    return () => { cancelled = true; };
  }, []);

  const changePreferences = useCallback((next: LocalPreferences) => {
    setPreferences(next);
    void setAppLanguage(normalizeLocale(next.language));
    void writeLocalPreferences(next);
  }, []);

  return { preferences, changePreferences };
}
