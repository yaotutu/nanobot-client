import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchSettings } from '@/features/settings/api';
import {
  mergeRuntimeMetadata,
  type RuntimeMetadata,
} from '@/services/runtime/runtime-capabilities';
import type { SettingsPayload } from '@/types/api/settings';

type SettingsLoadMode = 'initial' | 'refresh';

interface UseSettingsCatalogOptions {
  onSettingsChange?: (settings: SettingsPayload) => void;
  runtimeMetadata?: RuntimeMetadata;
}

export function useSettingsCatalog({
  onSettingsChange,
  runtimeMetadata,
}: UseSettingsCatalogOptions) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef<SettingsPayload | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const activeRequestRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeRequestRef.current = null;
    };
  }, []);

  const applySettings = useCallback((payload: SettingsPayload) => {
    if (!mountedRef.current) return;
    requestIdRef.current += 1;
    activeRequestRef.current = null;
    const next = mergeRuntimeMetadata(
      payload,
      settingsRef.current ?? runtimeMetadata,
    );
    settingsRef.current = next;
    setSettings(next);
    setLoading(false);
    setRefreshing(false);
    setError(null);
    onSettingsChange?.(next);
  }, [onSettingsChange, runtimeMetadata]);

  const applyUsage = useCallback((usage: NonNullable<SettingsPayload['usage']>) => {
    if (!mountedRef.current) return;
    setSettings((current) => {
      if (!current) return current;
      const next = { ...current, usage };
      settingsRef.current = next;
      return next;
    });
  }, []);

  const load = useCallback(async (mode: SettingsLoadMode = 'initial') => {
    if (!mountedRef.current || activeRequestRef.current !== null) return;
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = requestId;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);

    try {
      const payload = await fetchSettings();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      const next = mergeRuntimeMetadata(
        payload,
        settingsRef.current ?? runtimeMetadata,
      );
      settingsRef.current = next;
      setSettings(next);
      setError(null);
      onSettingsChange?.(next);
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : t('settings.status.loadError'),
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
  }, [onSettingsChange, runtimeMetadata, t]);

  useEffect(() => {
    const timer = setTimeout(() => void load('initial'), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return {
    applySettings,
    applyUsage,
    error,
    load,
    loading,
    refreshing,
    settings,
  };
}
