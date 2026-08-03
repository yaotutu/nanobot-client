import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchCliApps, fetchMcpPresets } from '@/features/capabilities/api';
import { useCapabilitiesStore } from '@/features/capabilities/store';
import type { CliAppsPayload, McpPresetsPayload } from '@/types/api/capabilities';

import {
  CLI_APPS_REFRESH_MAX_RETRIES,
  CLI_APPS_REFRESH_RETRY_MS,
} from '@/features/capabilities/model';

const EMPTY_CLI_APPS_PAYLOAD = { apps: [], installed_count: 0 } satisfies CliAppsPayload;
const EMPTY_MCP_PRESETS_PAYLOAD = { presets: [], installed_count: 0 } satisfies McpPresetsPayload;

export interface AppsCatalogStatus {
  message: string;
  error: boolean;
}

export function useAppsCatalog() {
  const { t } = useTranslation();
  const cliPayload = useCapabilitiesStore((state) => state.cliAppsPayload) ?? EMPTY_CLI_APPS_PAYLOAD;
  const mcpPayload = useCapabilitiesStore((state) => state.mcpPresetsPayload) ?? EMPTY_MCP_PRESETS_PAYLOAD;
  const applyCliAppsPayloadToStore = useCapabilitiesStore((state) => state.applyCliAppsPayload);
  const applyMcpPresetsPayloadToStore = useCapabilitiesStore((state) => state.applyMcpPresetsPayload);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<AppsCatalogStatus | null>(null);
  const mountedRef = useRef(true);
  const activeLoadRequestRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const cliRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (!cliRetryTimerRef.current) return;
    clearTimeout(cliRetryTimerRef.current);
    cliRetryTimerRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeLoadRequestRef.current = null;
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  const load = useCallback(async (refresh = false) => {
    if (!mountedRef.current || activeLoadRequestRef.current !== null) return;
    const requestId = ++requestIdRef.current;
    activeLoadRequestRef.current = requestId;
    clearRetryTimer();
    if (refresh) setRefreshing(true);
    else setLoading(true);

    const pollCliCatalog = (retryCount: number) => {
      if (
        !mountedRef.current ||
        requestId !== requestIdRef.current ||
        retryCount >= CLI_APPS_REFRESH_MAX_RETRIES
      ) return;
      cliRetryTimerRef.current = setTimeout(() => {
        cliRetryTimerRef.current = null;
        void fetchCliApps()
          .then((payload) => {
            if (!mountedRef.current || requestId !== requestIdRef.current) return;
            applyCliAppsPayloadToStore(payload);
            if (payload.catalog_refresh_pending) pollCliCatalog(retryCount + 1);
          })
          .catch((caught) => {
            if (!mountedRef.current || requestId !== requestIdRef.current) return;
            setStatus({
              message: caught instanceof Error
                ? caught.message
                : t('settings.cliApps.refreshFailed', {
                    defaultValue: 'Could not refresh the app catalog.',
                  }),
              error: true,
            });
          });
      }, CLI_APPS_REFRESH_RETRY_MS);
    };

    try {
      const [cliResult, mcpResult] = await Promise.allSettled([
        fetchCliApps(),
        fetchMcpPresets(),
      ]);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      if (cliResult.status === 'fulfilled') {
        applyCliAppsPayloadToStore(cliResult.value);
        if (cliResult.value.catalog_refresh_pending) pollCliCatalog(0);
      }
      if (mcpResult.status === 'fulfilled') applyMcpPresetsPayloadToStore(mcpResult.value);

      const errors = [cliResult, mcpResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason instanceof Error
          ? result.reason.message
          : t('settings.cliApps.loadFailed', {
              defaultValue: 'Could not load the tools catalog.',
            }));
      setStatus(errors.length ? { message: errors.join('\n'), error: true } : null);
    } finally {
      if (activeLoadRequestRef.current === requestId) {
        activeLoadRequestRef.current = null;
      }
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyCliAppsPayloadToStore, applyMcpPresetsPayloadToStore, clearRetryTimer, t]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const invalidateCatalogRequest = useCallback(() => {
    requestIdRef.current += 1;
    activeLoadRequestRef.current = null;
    clearRetryTimer();
    setLoading(false);
    setRefreshing(false);
  }, [clearRetryTimer]);

  const applyCliAppsPayload = useCallback((payload: CliAppsPayload) => {
    invalidateCatalogRequest();
    applyCliAppsPayloadToStore(payload);
  }, [applyCliAppsPayloadToStore, invalidateCatalogRequest]);

  const applyMcpPresetsPayload = useCallback((payload: McpPresetsPayload) => {
    invalidateCatalogRequest();
    applyMcpPresetsPayloadToStore(payload);
  }, [applyMcpPresetsPayloadToStore, invalidateCatalogRequest]);

  return {
    applyCliAppsPayload,
    applyMcpPresetsPayload,
    cliPayload,
    load,
    loading,
    mcpPayload,
    refreshing,
    setStatus,
    status,
  };
}
