import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchNanobotFeatures } from '@/features/runtime/api';
import type { NanobotFeaturesPayload } from '@/types/api/channels';

import { channelCopy } from '../components/channels-utils';

type ChannelsLoadMode = 'initial' | 'refresh' | 'silent';

const CHANNELS_POLL_INTERVAL_MS = 5_000;

export function useChannelsCatalog() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<NanobotFeaturesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const activeRequestRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeRequestRef.current = null;
    };
  }, []);

  const load = useCallback(async (mode: ChannelsLoadMode = 'initial') => {
    if (!mountedRef.current || activeRequestRef.current !== null) return;
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = requestId;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode !== 'silent') setError(null);

    try {
      const next = await fetchNanobotFeatures();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setPayload(next);
      setError(null);
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : channelCopy(t, 'loadFailed', 'Could not load channels.'),
      );
    } finally {
      if (activeRequestRef.current === requestId) {
        activeRequestRef.current = null;
      }
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const initialTimer = setTimeout(() => void load('initial'), 0);
    const pollTimer = setInterval(() => void load('silent'), CHANNELS_POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(pollTimer);
    };
  }, [load]);

  const applyPayload = useCallback((next: NanobotFeaturesPayload) => {
    if (!mountedRef.current) return;
    requestIdRef.current += 1;
    activeRequestRef.current = null;
    setPayload(next);
    setLoading(false);
    setRefreshing(false);
  }, []);

  return {
    applyPayload,
    error,
    load,
    loading,
    payload,
    refreshing,
    setError,
  };
}
