import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { fetchAutomations } from '@/features/automations/api';
import { errorMessage } from '@/features/automations/components/automations-utils';
import type { AutomationsPayload } from '@/types/api/automations';

const AUTOMATIONS_POLL_INTERVAL_MS = 5_000;
export type AutomationsLoadMode = 'initial' | 'refresh' | 'silent';

export function useAutomationsCatalog() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<AutomationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const activeRequestRef = useRef<number | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeRequestRef.current = null;
    };
  }, []);

  const applyPayload = useCallback((next: AutomationsPayload) => {
    if (!mountedRef.current) return;
    requestIdRef.current += 1;
    activeRequestRef.current = null;
    hasLoadedRef.current = true;
    setPayload(next);
    setLoading(false);
    setRefreshing(false);
    setError(null);
  }, []);

  const load = useCallback(async (mode: AutomationsLoadMode = 'silent') => {
    if (!mountedRef.current || activeRequestRef.current !== null) return;
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = requestId;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode !== 'silent') setError(null);
    try {
      const next = await fetchAutomations();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      hasLoadedRef.current = true;
      setPayload(next);
      setError(null);
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(errorMessage(caught, t('settings.automations.loadFailed', {
        defaultValue: 'Unable to load automations.',
      })));
    } finally {
      if (activeRequestRef.current === requestId) activeRequestRef.current = null;
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const start = () => {
      stop();
      void load(hasLoadedRef.current ? 'silent' : 'initial');
      interval = setInterval(() => void load('silent'), AUTOMATIONS_POLL_INTERVAL_MS);
    };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [load]);

  return { applyPayload, error, load, loading, payload, refreshing, setError };
}
