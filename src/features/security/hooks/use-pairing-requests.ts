import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { fetchPairingRequests, runPairingAction } from '@/features/security/api';
import type { PairingPayload } from '@/types/api/channels';

const PAIRING_POLL_INTERVAL_MS = 5_000;
type PairingLoadMode = 'initial' | 'refresh' | 'silent';

export function usePairingRequests() {
  const { t } = useTranslation();
  const [pairing, setPairing] = useState<PairingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
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

  const applyPayload = useCallback((payload: PairingPayload) => {
    if (!mountedRef.current) return;
    requestIdRef.current += 1;
    activeRequestRef.current = null;
    setPairing(payload);
    hasLoadedRef.current = true;
    setLoading(false);
    setRefreshing(false);
    setError(null);
  }, []);

  const load = useCallback(async (mode: PairingLoadMode = 'silent') => {
    if (!mountedRef.current || activeRequestRef.current !== null) return;
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = requestId;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode !== 'silent') setError(null);
    try {
      const payload = await fetchPairingRequests();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setPairing(payload);
      hasLoadedRef.current = true;
      setError(null);
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(caught instanceof Error
        ? caught.message
        : t('settings.security.loadPairingFailed', { defaultValue: 'Could not load pairing requests.' }));
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
      interval = setInterval(() => void load('silent'), PAIRING_POLL_INTERVAL_MS);
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

  const act = useCallback(async (action: 'approve' | 'deny', code: string) => {
    const key = `${action}:${code}`;
    setActionKey(key);
    setError(null);
    try {
      applyPayload(await runPairingAction(action, code));
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(caught instanceof Error
        ? caught.message
        : t('settings.security.pairingActionFailed', { defaultValue: 'Pairing action failed.' }));
    } finally {
      if (mountedRef.current) setActionKey(null);
    }
  }, [applyPayload, t]);

  return { actionKey, act, error, load, loading, pairing, refreshing };
}
