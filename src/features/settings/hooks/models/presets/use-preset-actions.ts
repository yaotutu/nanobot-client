import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import {
  createModelConfiguration,
  deleteModelConfiguration,
  migrateModelConfigurations,
  updateModelCallOrder,
  updateModelConfiguration,
} from '@/features/settings/api';
import type { ModelPresetInfo, SettingsPayload } from '@/types/api/settings';

import type { ModelDraft } from '@/features/settings/model/models-utils';
import {
  newPresetDraft,
  parsePositiveInteger,
  parseTemperature,
  presetDraft,
  providerIsConfigured,
} from '@/features/settings/model/models-utils';

interface UsePresetActionsOptions {
  settings: SettingsPayload;
  onSettingsChange: (settings: SettingsPayload) => void;
}

export function usePresetActions({ settings, onSettingsChange }: UsePresetActionsOptions) {
  const { t } = useTranslation();
  const namedPresets = settings.model_presets.filter((preset) => !preset.is_default);
  const initialPreset = namedPresets.find((preset) => preset.name === settings.model_call_order[0]) ?? namedPresets[0] ?? null;
  const draftDirtyRef = useRef(false);
  const [selectedName, setSelectedName] = useState(initialPreset?.name ?? '');
  const [draft, setDraft] = useState<ModelDraft | null>(initialPreset ? presetDraft(initialPreset) : null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedPreset = namedPresets.find((preset) => preset.name === selectedName) ?? null;
  const callOrder = settings.model_call_order;
  const orderedNames = new Set(callOrder);
  const visibleRows = [
    ...callOrder.map((name, index) => ({ name, index, preset: namedPresets.find((preset) => preset.name === name) })),
    ...namedPresets.filter((preset) => !orderedNames.has(preset.name)).map((preset) => ({ name: preset.name, index: -1, preset })),
  ];

  useEffect(() => {
    if (creating || draftDirtyRef.current) return;
    const timer = setTimeout(() => {
      const selected = settings.model_presets.find((preset) => !preset.is_default && preset.name === selectedName);
      if (selected) {
        setDraft(presetDraft(selected));
        return;
      }
      if (selectedName) {
        setSelectedName('');
        setDraft(null);
        setEditorOpen(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [creating, selectedName, settings]);

  const updateDraft = (value: Partial<ModelDraft>) => {
    draftDirtyRef.current = true;
    setDraft((current) => current ? { ...current, ...value } : current);
  };

  const applyOrder = async (nextOrder: string[]) => {
    if (busy || nextOrder.length === 0) return;
    setBusy('order');
    setError(null);
    try {
      onSettingsChange(await updateModelCallOrder(nextOrder));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.models.callOrderUpdateFailed', { defaultValue: 'Could not update model call order.' }));
    } finally {
      setBusy(null);
    }
  };

  const openPreset = (preset: ModelPresetInfo) => {
    if (selectedName === preset.name && editorOpen && !creating) {
      setEditorOpen(false);
      return;
    }
    draftDirtyRef.current = false;
    setSelectedName(preset.name);
    setDraft(presetDraft(preset));
    setCreating(false);
    setAdvancedOpen(false);
    setEditorOpen(true);
    setError(null);
  };

  const beginCreate = () => {
    draftDirtyRef.current = false;
    setSelectedName('');
    setDraft(newPresetDraft(settings));
    setCreating(true);
    setAdvancedOpen(false);
    setEditorOpen(true);
    setError(null);
  };

  const cancelEdit = () => {
    draftDirtyRef.current = false;
    setCreating(false);
    setAdvancedOpen(false);
    setEditorOpen(false);
    setDraft(selectedPreset ? presetDraft(selectedPreset) : null);
    setError(null);
  };

  const syncSavedPreset = (next: SettingsPayload, name: string | null | undefined) => {
    const saved = name ? next.model_presets.find((preset) => preset.name === name) : null;
    draftDirtyRef.current = false;
    if (saved) {
      setSelectedName(saved.name);
      setDraft(presetDraft(saved));
      setCreating(false);
    }
    onSettingsChange(next);
  };

  const savePreset = async () => {
    if (!draft || busy) return;
    const maxTokens = parsePositiveInteger(draft.maxTokens);
    const contextWindowTokens = parsePositiveInteger(draft.contextWindowTokens);
    const temperature = parseTemperature(draft.temperature);
    if (!draft.label.trim() || !draft.provider.trim() || !draft.model.trim()) {
      setError(t('settings.models.presetFieldsRequired', { defaultValue: 'Preset name, provider, and model are required.' }));
      return;
    }
    if (maxTokens === null || contextWindowTokens === null || temperature === null) {
      setError(t('settings.models.invalidGenerationSettings', { defaultValue: 'Token values must be positive integers and temperature must be between 0 and 2.' }));
      return;
    }
    if (!providerIsConfigured(settings, draft.provider, selectedPreset?.resolved_provider)) {
      setError(t('settings.models.configureProviderBeforeSaving'));
      return;
    }
    setBusy('preset');
    setError(null);
    try {
      if (creating) {
        const created = await createModelConfiguration({
          label: draft.label.trim(),
          provider: draft.provider,
          model: draft.model.trim(),
          maxTokens,
          contextWindowTokens,
          temperature,
          reasoningEffort: draft.reasoningEffort.trim() || null,
        });
        const createdName = created.created_model_preset;
        const next = createdName && !created.model_call_order.includes(createdName)
          ? await updateModelCallOrder([...created.model_call_order, createdName])
          : created;
        syncSavedPreset(next, createdName);
      } else if (selectedPreset) {
        const next = await updateModelConfiguration({
          name: selectedPreset.name,
          label: draft.label.trim(),
          provider: draft.provider,
          model: draft.model.trim(),
          maxTokens,
          contextWindowTokens,
          temperature,
          reasoningEffort: draft.reasoningEffort.trim() || null,
        });
        syncSavedPreset(next, selectedPreset.name);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.models.saveFailed', { defaultValue: 'Could not save the model preset.' }));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () => {
    if (!selectedPreset || busy) return;
    if (callOrder.includes(selectedPreset.name)) {
      setError(t('settings.models.removeBeforeDelete'));
      return;
    }
    Alert.alert(t('settings.models.deletePresetTitle'), t('settings.models.deletePresetHelp', { name: selectedPreset.label }), [
      { text: t('settings.actions.cancel'), style: 'cancel' },
      {
        text: t('settings.actions.delete'),
        style: 'destructive',
        onPress: () => {
          setBusy('delete');
          setError(null);
          void deleteModelConfiguration(selectedPreset.name)
            .then((next) => {
              draftDirtyRef.current = false;
              setSelectedName('');
              setDraft(null);
              setEditorOpen(false);
              onSettingsChange(next);
            })
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('settings.models.deleteFailed', { defaultValue: 'Could not delete the preset.' })))
            .finally(() => setBusy(null));
        },
      },
    ]);
  };

  const migrate = async () => {
    if (busy) return;
    setBusy('migrate');
    setError(null);
    try {
      onSettingsChange(await migrateModelConfigurations());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.models.convertFailed', { defaultValue: 'Could not convert the model configuration.' }));
    } finally {
      setBusy(null);
    }
  };

  return {
    advancedOpen,
    applyOrder,
    beginCreate,
    busy,
    callOrder,
    cancelEdit,
    confirmDelete,
    creating,
    draft,
    editorOpen,
    error,
    migrate,
    namedPresets,
    openPreset,
    savePreset,
    selectedName,
    selectedPreset,
    setAdvancedOpen,
    updateDraft,
    visibleRows,
  };
}
