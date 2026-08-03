import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { fetchSettingsUsage } from '@/features/settings/api';
import type { SettingsPayload } from '@/types/api/settings';

const SETTINGS_USAGE_POLL_INTERVAL_MS = 5_000;

interface UseSettingsUsageOptions {
  enabled: boolean;
  onUsage: (usage: NonNullable<SettingsPayload['usage']>) => void;
}

export function useSettingsUsage({ enabled, onUsage }: UseSettingsUsageOptions) {
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      inFlightRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !mountedRef.current || inFlightRef.current) return;
    const requestId = ++requestIdRef.current;
    inFlightRef.current = true;
    try {
      const usage = await fetchSettingsUsage();
      if (mountedRef.current && requestId === requestIdRef.current) onUsage(usage);
    } catch {
      // Usage is best-effort and must never replace or block the settings payload.
    } finally {
      if (requestId === requestIdRef.current) inFlightRef.current = false;
    }
  }, [enabled, onUsage]);

  useEffect(() => {
    if (!enabled) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const start = () => {
      stop();
      void refresh();
      interval = setInterval(() => void refresh(), SETTINGS_USAGE_POLL_INTERVAL_MS);
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
  }, [enabled, refresh]);
}
