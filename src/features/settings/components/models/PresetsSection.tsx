import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import ListOrdered from 'lucide-react-native/icons/list-ordered';
import X from 'lucide-react-native/icons/x';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsButton, SettingsInput, SettingsNotice, SettingsPicker, SettingsSection, StatusPill } from '../settings-controls';
import { ModelCatalog } from './ModelCatalog';
import { FieldLabel, IconButton, ProviderMark } from './models-controls';
import type { ModelsSettingsProps } from '@/features/settings/model/models-utils';
import { usePresetActions } from '@/features/settings/hooks/models/presets/use-preset-actions';
import {
  CONTEXT_WINDOW_OPTIONS,
  formatTokens,
  providerIsConfigured,
} from '@/features/settings/model/models-utils';

export function PresetsSection({ colors, settings, showBrandLogos, onSettingsChange }: ModelsSettingsProps) {
  const { t } = useTranslation();
  const {
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
    openPreset,
    savePreset,
    selectedName,
    selectedPreset,
    setAdvancedOpen,
    updateDraft,
    visibleRows,
  } = usePresetActions({ settings, onSettingsChange });

  const providerOptions = useMemo(() => {
    const rows = settings.providers.filter((provider) => provider.configured && provider.model_selectable !== false);
    const selectedProvider = settings.providers.find((provider) => provider.name === draft?.provider);
    if (selectedProvider && !rows.some((provider) => provider.name === selectedProvider.name)) rows.push(selectedProvider);
    const result = rows.map((provider) => ({ value: provider.name, label: provider.label, description: provider.configured ? t('settings.values.configured') : t('settings.values.notConfigured') }));
    if (draft?.provider === 'auto') result.unshift({ value: 'auto', label: 'Auto', description: t('settings.models.autoProviderCustomOnly') });
    return result;
  }, [draft?.provider, settings.providers, t]);

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
            <SettingsInput autoFocus={creating} colors={colors} onChangeText={(label) => updateDraft({ label })} placeholder={t('settings.models.presetNamePlaceholder')} value={draft.label} />
          </View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.providers.title')}</FieldLabel>
            <SettingsPicker
              colors={colors}
              onChange={(provider) => updateDraft({ provider, model: provider === draft.provider ? draft.model : '' })}
              options={providerOptions}
              title={t('settings.providers.title')}
              value={providerOptions.some((option) => option.value === draft.provider) ? draft.provider : ''}
            />
          </View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.models.selectModel')}</FieldLabel>
            <ModelCatalog colors={colors} onChange={(model) => updateDraft({ model })} provider={draft.provider} settings={settings} value={draft.model} />
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
                <View style={styles.columnField}><FieldLabel colors={colors}>{t('settings.models.maxTokens')}</FieldLabel><SettingsInput colors={colors} keyboardType="number-pad" onChangeText={(maxTokens) => updateDraft({ maxTokens })} value={draft.maxTokens} /></View>
                <View style={styles.columnField}><FieldLabel colors={colors}>{t('settings.models.temperature')}</FieldLabel><SettingsInput colors={colors} keyboardType="decimal-pad" onChangeText={(temperature) => updateDraft({ temperature })} value={draft.temperature} /></View>
              </View>
              <View style={styles.fieldStack}>
                <FieldLabel colors={colors}>{t('settings.models.contextWindow', { defaultValue: 'Context window' })}</FieldLabel>
                <SettingsPicker
                  colors={colors}
                  onChange={(contextWindowTokens) => updateDraft({ contextWindowTokens })}
                  options={Array.from(new Set([...CONTEXT_WINDOW_OPTIONS.map(String), draft.contextWindowTokens])).map((value) => ({ value, label: formatTokens(Number(value)) }))}
                  title={t('settings.models.contextWindow', { defaultValue: 'Context window' })}
                  value={draft.contextWindowTokens}
                />
              </View>
              <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.models.reasoningEffort')}</FieldLabel><SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(reasoningEffort) => updateDraft({ reasoningEffort })} placeholder={t('settings.values.default')} value={draft.reasoningEffort} /></View>
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
