import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchSkills } from '@/features/skills/api';
import type { SkillSummary } from '@/types/api/capabilities';

export function useSkillsCatalog() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (!mountedRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const payload = await fetchSkills();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setSkills(payload.skills ?? []);
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(caught instanceof Error
        ? caught.message
        : t('settings.skills.loadCatalogFailed', { defaultValue: 'Unable to load skills.' }));
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        inFlightRef.current = false;
      }
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return { error, load, loading, refreshing, skills };
}
