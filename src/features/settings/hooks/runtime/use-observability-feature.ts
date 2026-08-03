import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchNanobotFeatures, setNanobotFeatureEnabled } from '@/services/api/nanobot-features';
import { fetchSettings } from '@/features/settings/api';
import type { NanobotFeatureInfo } from '@/types/api/nanobot-features';
import type { SettingsPayload } from '@/types/api/settings';

export function useObservabilityFeature(onSettingsChange: (settings: SettingsPayload) => void) {
  const { t } = useTranslation();
  const [feature, setFeature] = useState<NanobotFeatureInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartPending, setRestartPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchNanobotFeatures()
      .then((payload) => {
        if (cancelled) return;
        setFeature(payload.features.find((item) => item.name === 'langfuse') ?? null);
        setRestartPending(Boolean(payload.requires_restart));
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : t('settings.status.loadError');
        if (message !== 'HTTP 404') setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  const enable = async () => {
    if (actionPending) return;
    setActionPending(true);
    setError(null);
    try {
      const payload = await setNanobotFeatureEnabled('enable', 'langfuse');
      setFeature(payload.features.find((item) => item.name === 'langfuse') ?? null);
      setRestartPending(Boolean(payload.requires_restart));
      try {
        onSettingsChange(await fetchSettings());
      } catch {
        // The feature mutation remains authoritative if the follow-up refresh fails.
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.status.unsaved'));
    } finally {
      setActionPending(false);
    }
  };

  return { actionPending, enable, error, feature, loading, restartPending };
}
