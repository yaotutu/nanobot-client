import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  fetchApiService,
  startApiService,
  stopApiService,
} from '@/features/settings/api';
import type { ApiServicePayload, SettingsPayload } from '@/types/api/settings';

function loopback(host: string): boolean {
  const value = host.trim().toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1' || value === '[::1]';
}

export function useApiService(settings: SettingsPayload) {
  const { t } = useTranslation();
  const [api, setApi] = useState<ApiServicePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'start' | 'stop' | null>(null);
  const [host, setHost] = useState(settings.api?.host ?? '127.0.0.1');
  const [port, setPort] = useState(String(settings.api?.port ?? 8900));
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApiService()
      .then((payload) => {
        if (cancelled) return;
        setApi(payload);
        setHost(payload.host);
        setPort(String(payload.port));
        setError(null);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : t('settings.status.loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  const policy = useMemo(() => {
    const parsedPort = Number.parseInt(port, 10);
    const inputValid = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535;
    const networkAccess = !loopback(host);
    const requiresNetworkKey = networkAccess && !apiKey.trim() && !(api?.api_key_hint ?? settings.api?.api_key_hint);
    return { inputValid, networkAccess, parsedPort, requiresNetworkKey };
  }, [api?.api_key_hint, apiKey, host, port, settings.api?.api_key_hint]);

  const changeState = async (nextAction: 'start' | 'stop') => {
    if (nextAction === 'start' && (!policy.inputValid || policy.requiresNetworkKey)) return;
    setAction(nextAction);
    setError(null);
    try {
      const next = nextAction === 'start'
        ? await startApiService({
            host: host.trim(),
            port: policy.parsedPort,
            timeout: api?.timeout ?? settings.api?.timeout ?? 120,
            apiKey: apiKey.trim() || undefined,
          })
        : await stopApiService();
      setApi(next);
      setHost(next.host);
      setPort(String(next.port));
      setApiKey('');
      setApiKeyVisible(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.status.unsaved'));
    } finally {
      setAction(null);
    }
  };

  return {
    action,
    api,
    apiKey,
    apiKeyVisible,
    changeState,
    error,
    host,
    loading,
    policy,
    port,
    setApiKey,
    setApiKeyVisible,
    setHost,
    setPort,
  };
}
