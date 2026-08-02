import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  X,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  createModelConfiguration,
  deleteModelConfiguration,
  migrateModelConfigurations,
  updateModelCallOrder,
  updateModelConfiguration,
} from '@/features/settings/api';
import type { ModelPresetInfo } from '@/types/api/settings';

import { SettingsButton, SettingsInput, SettingsNotice, SettingsPicker, SettingsSection, StatusPill } from '../settings-controls';
import { ModelCatalog } from './ModelCatalog';
import { FieldLabel, IconButton, ProviderMark } from './models-controls';
import type { ModelDraft, ModelsSettingsProps } from './models-utils';
import {
  CONTEXT_WINDOW_OPTIONS,
  formatTokens,
  newPresetDraft,
  parsePositiveInteger,
  parseTemperature,
  presetDraft,
  providerIsConfigured,
} from './models-utils';

export function PresetsSection({ colors, settings, showBrandLogos, onSettingsChange }: ModelsSettingsProps) {
  const { t } = useTranslation();
  const namedPresets = settings.model_presets.filter((preset) => !preset.is_default);
  const initialPreset = namedPresets.find((preset) => preset.name === settings.model_call_order[0]) ?? namedPresets[0] ?? null;
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

  const providerOptions = useMemo(() => {
    const rows = settings.providers.filter((provider) => provider.configured && provider.model_selectable !== false);
    const selectedProvider = settings.providers.find((provider) => provider.name === draft?.provider);
    if (selectedProvider && !rows.some((provider) => provider.name === selectedProvider.name)) rows.push(selectedProvider);
    const result = rows.map((provider) => ({ value: provider.name, label: provider.label, description: provider.configured ? t('settings.values.configured') : t('settings.values.notConfigured') }));
    if (draft?.provider === 'auto') result.unshift({ value: 'auto', label: 'Auto', description: t('settings.models.autoProviderCustomOnly') });
    return result;
  }, [draft?.provider, settings.providers, t]);

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
    setSelectedName(preset.name);
    setDraft(presetDraft(preset));
    setCreating(false);
    setAdvancedOpen(false);
    setEditorOpen(true);
  };

  const beginCreate = () => {
    setSelectedName('');
    setDraft(newPresetDraft(settings));
    setCreating(true);
    setAdvancedOpen(false);
    setEditorOpen(true);
  };

  const cancelEdit = () => {
    setCreating(false);
    setAdvancedOpen(false);
    setEditorOpen(false);
    setDraft(selectedPreset ? presetDraft(selectedPreset) : null);
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
        if (createdName && !created.model_call_order.includes(createdName)) {
          onSettingsChange(await updateModelCallOrder([...created.model_call_order, createdName],
          ));
        } else {
          onSettingsChange(created);
        }
      } else if (selectedPreset) {
        onSettingsChange(await updateModelConfiguration({
          name: selectedPreset.name,
          label: draft.label.trim(),
          provider: draft.provider,
          model: draft.model.trim(),
          maxTokens,
          contextWindowTokens,
          temperature,
          reasoningEffort: draft.reasoningEffort.trim() || null,
        }));
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
            .then(onSettingsChange)
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

  return (
    <SettingsSection colors={colors} title={t('settings.models.presets')}>
      {!settings.model_call_order_editable ? (
        <View style={styles.migrateBox}>
          <View style={[styles.largeIcon, { backgroundColor: colors.pressed }]}><ListOrdered color={colors.muted} size={18} /></View>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('settings.models.convertTitle')}</Text>
            <Text style={[styles.rowDescription, { color: colors.subtle }]}>{t('settings.models.convertHelp')}</Text>
          </View>
          <SettingsButton colors={colors} disabled={busy !== null} label={busy === 'migrate' ? t('settings.models.converting') : t('settings.models.convertAction')} onPress={() => void migrate()} />
        </View>
      ) : (
        <>
          {visibleRows.map(({ name, index, preset }, rowIndex) => {
            const ordered = index >= 0;
            const active = index === 0;
            const selected = preset?.name === selectedName && editorOpen;
            return (
              <Pressable
                disabled={!preset || busy !== null}
                key={`${name}:${index}`}
                onPress={() => preset && openPreset(preset)}
                style={({ pressed }) => [
                  styles.presetRow,
                  rowIndex > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                  selected && { backgroundColor: colors.pressed },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <ProviderMark colors={colors} label={preset?.provider ?? '?'} showBrandLogos={showBrandLogos} />
                <View style={styles.rowCopy}>
                  <View style={styles.titleLine}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{preset?.label ?? name}</Text>
                    {active ? <StatusPill colors={colors} label={t('settings.models.primary')} tone="success" /> : null}
                    {!ordered ? <StatusPill colors={colors} label={t('settings.models.disabled')} /> : null}
                    {preset && !providerIsConfigured(settings, preset.provider, preset.resolved_provider) ? <StatusPill colors={colors} label={t('settings.values.notConfigured')} tone="warning" /> : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.rowDescription, { color: colors.subtle }]}>{preset ? `${preset.provider} · ${preset.model}` : t('settings.models.presetMissing', { defaultValue: 'Preset unavailable' })}</Text>
                </View>
                <View style={styles.rowActions}>
                  {ordered ? (
                    <>
                      <IconButton colors={colors} disabled={index === 0 || busy !== null} label={t('settings.models.moveUp')} onPress={() => {
                        const next = [...callOrder];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        void applyOrder(next);
                      }}><ArrowUp color={colors.muted} size={14} /></IconButton>
                      <IconButton colors={colors} disabled={index === callOrder.length - 1 || busy !== null} label={t('settings.models.moveDown')} onPress={() => {
                        const next = [...callOrder];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        void applyOrder(next);
                      }}><ArrowDown color={colors.muted} size={14} /></IconButton>
                      <IconButton colors={colors} disabled={callOrder.length <= 1 || busy !== null} label={t('settings.models.removeFromOrder')} onPress={() => void applyOrder(callOrder.filter((_, itemIndex) => itemIndex !== index))}><X color={colors.muted} size={14} /></IconButton>
                    </>
                  ) : (
                    <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.models.addToOrder')} onPress={() => void applyOrder([...callOrder, name])} />
                  )}
                </View>
              </Pressable>
            );
          })}
          <View style={[styles.sectionFooter, { borderTopColor: colors.border }]}>
            <Text style={[styles.helpText, { color: colors.subtle }]}>{t('settings.models.callOrder')}</Text>
            <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.models.newPreset')} onPress={beginCreate} />
          </View>
        </>
      )}

      {editorOpen && draft ? (
        <View style={[styles.editor, { borderTopColor: colors.border, backgroundColor: colors.pressed }]}>
          <View style={styles.editorHeader}>
            <Text style={[styles.editorTitle, { color: colors.foreground }]}>{creating ? t('settings.models.newPreset') : t('settings.models.editPreset')}</Text>
            <Pressable accessibilityLabel={t('settings.actions.cancel')} onPress={cancelEdit}><X color={colors.muted} size={18} /></Pressable>
          </View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.models.presetName')}</FieldLabel>
            <SettingsInput autoFocus={creating} colors={colors} onChangeText={(label) => setDraft((current) => current ? { ...current, label } : current)} placeholder={t('settings.models.presetNamePlaceholder')} value={draft.label} />
          </View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.providers.title')}</FieldLabel>
            <SettingsPicker
              colors={colors}
              onChange={(provider) => setDraft((current) => current ? { ...current, provider, model: provider === current.provider ? current.model : '' } : current)}
              options={providerOptions}
              title={t('settings.providers.title')}
              value={providerOptions.some((option) => option.value === draft.provider) ? draft.provider : ''}
            />
          </View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.models.selectModel')}</FieldLabel>
            <ModelCatalog colors={colors} onChange={(model) => setDraft((current) => current ? { ...current, model } : current)} provider={draft.provider} settings={settings} value={draft.model} />
          </View>
          <Pressable onPress={() => setAdvancedOpen((value) => !value)} style={[styles.advancedHeader, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.rowCopy}>
              <Text style={[styles.advancedTitle, { color: colors.foreground }]}>{t('settings.providers.advancedOptions')}</Text>
              <Text style={[styles.helpText, { color: colors.subtle }]}>{t('settings.models.advancedSummary', { context: formatTokens(Number(draft.contextWindowTokens) || 0), max: formatTokens(Number(draft.maxTokens) || 0) })}</Text>
            </View>
            {advancedOpen ? <ChevronUp color={colors.muted} size={16} /> : <ChevronDown color={colors.muted} size={16} />}
          </Pressable>
          {advancedOpen ? (
            <View style={styles.advancedBody}>
              <View style={styles.twoColumns}>
                <View style={styles.columnField}><FieldLabel colors={colors}>{t('settings.models.maxTokens')}</FieldLabel><SettingsInput colors={colors} keyboardType="number-pad" onChangeText={(maxTokens) => setDraft((current) => current ? { ...current, maxTokens } : current)} value={draft.maxTokens} /></View>
                <View style={styles.columnField}><FieldLabel colors={colors}>{t('settings.models.temperature')}</FieldLabel><SettingsInput colors={colors} keyboardType="decimal-pad" onChangeText={(temperature) => setDraft((current) => current ? { ...current, temperature } : current)} value={draft.temperature} /></View>
              </View>
              <View style={styles.fieldStack}>
                <FieldLabel colors={colors}>{t('settings.models.contextWindow', { defaultValue: 'Context window' })}</FieldLabel>
                <SettingsPicker
                  colors={colors}
                  onChange={(contextWindowTokens) => setDraft((current) => current ? { ...current, contextWindowTokens } : current)}
                  options={Array.from(new Set([...CONTEXT_WINDOW_OPTIONS.map(String), draft.contextWindowTokens])).map((value) => ({ value, label: formatTokens(Number(value)) }))}
                  title={t('settings.models.contextWindow', { defaultValue: 'Context window' })}
                  value={draft.contextWindowTokens}
                />
              </View>
              <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.models.reasoningEffort')}</FieldLabel><SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(reasoningEffort) => setDraft((current) => current ? { ...current, reasoningEffort } : current)} placeholder={t('settings.values.default')} value={draft.reasoningEffort} /></View>
            </View>
          ) : null}
          {error ? <SettingsNotice colors={colors} error message={error} /> : null}
          <View style={styles.editorActions}>
            {!creating && selectedPreset ? <SettingsButton colors={colors} disabled={busy !== null || callOrder.includes(selectedPreset.name)} label={t('settings.actions.delete')} onPress={confirmDelete} /> : <View />}
            <View style={styles.actionGroup}>
              <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.actions.cancel')} onPress={cancelEdit} />
              <SettingsButton colors={colors} disabled={busy !== null} label={busy === 'preset' ? t('settings.actions.saving') : t('settings.actions.savePreset')} onPress={() => void savePreset()} primary />
            </View>
          </View>
        </View>
      ) : error ? <View style={styles.noticeWrap}><SettingsNotice colors={colors} error message={error} /></View> : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  advancedBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 13 },
  advancedHeader: { minHeight: 48, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  advancedTitle: { fontSize: 13, fontWeight: '700' },
  columnField: { flex: 1, minWidth: 0, gap: 6 },
  editor: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 13 },
  editorActions: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorTitle: { fontSize: 14, fontWeight: '800' },
  fieldStack: { gap: 6 },
  helpText: { fontSize: 11.5, lineHeight: 17 },
  largeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  migrateBox: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  noticeWrap: { padding: 12 },
  presetRow: { minHeight: 78, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowDescription: { fontSize: 11.5, lineHeight: 16 },
  rowTitle: { fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  sectionFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  twoColumns: { flexDirection: 'row', gap: 10 },
});
