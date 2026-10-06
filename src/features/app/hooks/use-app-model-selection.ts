import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchChatModelCatalog } from '@/features/chat';
import type { ChatModelCatalog } from '@/types/api/chat/models';
import type { BootstrapResponse } from '@/types/api/runtime';
import type { ChatSummary } from '@/types/api/sidebar';

interface UseAppModelSelectionOptions {
  activeSession: ChatSummary | null;
  bootstrap: BootstrapResponse;
  modelSettingsRevision: number;
  onModelPresetChange: (name: string) => Promise<void>;
  runtimeModelName: string | null;
  turnModelName: string | null;
}

export function useAppModelSelection({
  activeSession,
  bootstrap,
  modelSettingsRevision,
  onModelPresetChange,
  runtimeModelName,
  turnModelName,
}: UseAppModelSelectionOptions) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ChatModelCatalog | null>(null);
  const [localSelection, setLocalSelection] = useState<{
    scopeKey: string;
    preset: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchChatModelCatalog({ signal: controller.signal })
      .then(setCatalog)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        // 目录刷新失败时保留上次模型列表；首次失败则使用 bootstrap 的模型名称。
      });
    return () => controller.abort();
  }, [bootstrap.api_token, modelSettingsRevision]);

  const scopeKey = activeSession?.key ?? '__new__';
  const localPreset = localSelection?.scopeKey === scopeKey
    ? localSelection.preset
    : null;
  const activeModelPreset = localPreset
    || activeSession?.modelPreset?.trim()
    || catalog?.agent.model_preset?.trim()
    || 'default';
  const activeModelPresetInfo = catalog?.model_presets.find(
    (preset) => preset.name === activeModelPreset,
  ) ?? null;
  const modelDisplayLabel = activeModelPresetInfo?.label?.trim()
    || turnModelName?.trim()
    || runtimeModelName?.trim()
    || bootstrap.model_name?.trim()
    || activeModelPreset
    || 'nanobot';
  const orderedModelPresets = useMemo(() => {
    const order = new Map(
      (catalog?.model_call_order ?? []).map((name, index) => [name.trim(), index]),
    );
    return [...(catalog?.model_presets ?? [])].sort((left, right) => (
      (order.get(left.name.trim()) ?? Number.POSITIVE_INFINITY)
      - (order.get(right.name.trim()) ?? Number.POSITIVE_INFINITY)
    ));
  }, [catalog?.model_call_order, catalog?.model_presets]);

  const changeModelPreset = useCallback(async (name: string) => {
    const previous = localSelection;
    setLocalSelection({ scopeKey, preset: name });
    try {
      await onModelPresetChange(name);
    } catch (caught) {
      setLocalSelection(previous);
      Alert.alert(
        t('settings.models.selectModel'),
        caught instanceof Error ? caught.message : t('settings.status.loadError'),
      );
      throw caught;
    }
  }, [localSelection, onModelPresetChange, scopeKey, t]);

  return {
    activeModelPreset,
    changeModelPreset,
    modelDisplayLabel,
    orderedModelPresets,
  };
}

export type AppModelSelection = ReturnType<typeof useAppModelSelection>;
