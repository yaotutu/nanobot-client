import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchSettings } from '@/features/settings/api';
import { resolveRuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type { BootstrapResponse } from '@/types/api/runtime';
import type { ChatSummary } from '@/types/api/sidebar';
import type { SettingsPayload } from '@/types/api/settings';

interface UseModelSelectionOptions {
  activeSession: ChatSummary | null;
  bootstrap: BootstrapResponse;
  modelSettingsRevision: number;
  onModelPresetChange: (name: string) => Promise<void>;
  runtimeModelName: string | null;
  turnModelName: string | null;
}

export function useModelSelection(options: UseModelSelectionOptions) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [localSelection, setLocalSelection] = useState<{
    scopeKey: string;
    preset: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchSettings({ signal: controller.signal })
      .then(setSettings)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        // Keep the last successful settings payload and use bootstrap defaults
        // when settings have never loaded.
      });
    return () => controller.abort();
  }, [options.bootstrap.api_token, options.modelSettingsRevision]);

  const scopeKey = options.activeSession?.key ?? '__new__';
  const localPreset = localSelection?.scopeKey === scopeKey
    ? localSelection.preset
    : null;
  const activeModelPreset = localPreset
    || options.activeSession?.modelPreset?.trim()
    || settings?.agent.model_preset?.trim()
    || 'default';
  const activeModelPresetInfo = settings?.model_presets.find(
    (preset) => preset.name === activeModelPreset,
  ) ?? null;
  const modelDisplayLabel = activeModelPresetInfo?.label?.trim()
    || options.turnModelName?.trim()
    || options.runtimeModelName?.trim()
    || options.bootstrap.model_name?.trim()
    || activeModelPreset
    || 'nanobot';
  const orderedModelPresets = useMemo(() => {
    const order = new Map(
      (settings?.model_call_order ?? []).map((name, index) => [name.trim(), index]),
    );
    return [...(settings?.model_presets ?? [])].sort((left, right) => (
      (order.get(left.name.trim()) ?? Number.POSITIVE_INFINITY)
      - (order.get(right.name.trim()) ?? Number.POSITIVE_INFINITY)
    ));
  }, [settings?.model_call_order, settings?.model_presets]);

  const changeModelPreset = useCallback(async (name: string) => {
    const previous = localSelection;
    setLocalSelection({ scopeKey, preset: name });
    try {
      await options.onModelPresetChange(name);
    } catch (caught) {
      setLocalSelection(previous);
      Alert.alert(
        t('settings.models.selectModel'),
        caught instanceof Error ? caught.message : t('settings.status.loadError'),
      );
      throw caught;
    }
  }, [localSelection, options, scopeKey, t]);

  return {
    activeModelPreset,
    changeModelPreset,
    modelDisplayLabel,
    orderedModelPresets,
    runtimePolicy: resolveRuntimeClientPolicy(settings, options.bootstrap),
    settings,
    setSettings,
  };
}
