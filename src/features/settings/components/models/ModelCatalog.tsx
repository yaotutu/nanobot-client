import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchProviderModels } from '@/features/settings/api';
import type {
  ProviderAdvancedField,
  ProviderModelsPayload,
  SettingsPayload,
} from '@/types/api/settings';

import type { Palette } from '@/ui/palette';
import { SegmentedControl, SettingsInput, SettingsPicker } from '../settings-controls';
import { FieldLabel, IconButton } from './models-controls';
import type { ProviderApiType, ProviderForm } from '@/features/settings/model/models-utils';
import { providerIsConfigured } from '@/features/settings/model/models-utils';

export function ModelCatalog({ colors, settings, provider, value, onChange }: {
  colors: Palette;
  settings: SettingsPayload;
  provider: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<ProviderModelsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveProvider = provider === 'auto'
    ? settings.agent.resolved_provider ?? provider
    : provider;
  const configured = providerIsConfigured(settings, effectiveProvider);

  const load = async () => {
    if (!effectiveProvider || effectiveProvider === 'auto' || loading) return;
    setLoading(true);
    setError(null);
    try {
      setPayload(await fetchProviderModels(effectiveProvider));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.models.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const options = payload?.models.map((model) => ({
    value: model.id,
    label: model.label ?? model.id,
    description: [model.label && model.label !== model.id ? model.id : '', model.description ?? '']
      .filter(Boolean)
      .join(' · '),
  })) ?? [];

  return (
    <View style={styles.fieldStack}>
      <View style={styles.inlineField}>
        <SettingsInput
          autoCapitalize="none"
          autoCorrect={false}
          colors={colors}
          onChangeText={onChange}
          placeholder={configured ? t('settings.models.searchModels') : t('settings.models.providerNotConfigured')}
          value={value}
        />
        <IconButton colors={colors} disabled={!configured || loading} label={t('settings.models.searchCatalog')} onPress={() => void load()}>
          {loading ? <ActivityIndicator color={colors.muted} size="small" /> : <RefreshCw color={colors.muted} size={15} />}
        </IconButton>
      </View>
      {payload?.status === 'available' && options.length > 0 ? (
        <SettingsPicker
          colors={colors}
          onChange={onChange}
          options={options}
          title={`${payload.label} · ${t('settings.models.selectModel')}`}
          value={options.some((option) => option.value === value) ? value : ''}
        />
      ) : null}
      {payload ? (
        <Text style={[styles.helpText, { color: colors.subtle }]}>
          {payload.message ?? `${payload.catalog_kind} · ${payload.model_count} ${t('settings.models.modelsAvailable')}`}
        </Text>
      ) : null}
      {error ? <Text style={[styles.helpText, { color: colors.errorText }]}>{error}</Text> : null}
    </View>
  );
}

export function AdvancedProviderFields({ colors, fields, form, onChange }: {
  colors: Palette;
  fields: ProviderAdvancedField[];
  form: ProviderForm;
  onChange: (value: Partial<ProviderForm>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const enabled = new Set(fields);
  if (enabled.size === 0) return null;

  return (
    <View style={[styles.advancedPanel, { borderColor: colors.border }]}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.advancedHeader}>
        <Text style={[styles.advancedTitle, { color: colors.foreground }]}>{t('settings.providers.advancedOptions')}</Text>
        {open ? <ChevronUp color={colors.muted} size={16} /> : <ChevronDown color={colors.muted} size={16} />}
      </Pressable>
      {open ? (
        <View style={[styles.advancedBody, { borderTopColor: colors.border }]}>
          {enabled.has('api_type') ? (
            <View style={styles.fieldStack}>
              <FieldLabel colors={colors}>{t('settings.providers.apiType')}</FieldLabel>
              <SegmentedControl
                colors={colors}
                onChange={(apiType) => onChange({ apiType: apiType as ProviderApiType })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'chat_completions', label: 'Chat' },
                  { value: 'responses', label: 'Responses' },
                ]}
                value={form.apiType}
              />
            </View>
          ) : null}
          {enabled.has('thinking_style') ? (
            <View style={styles.fieldStack}>
              <FieldLabel colors={colors}>{t('settings.providers.thinkingStyle')}</FieldLabel>
              <SettingsPicker
                colors={colors}
                onChange={(thinkingStyle) => onChange({ thinkingStyle })}
                options={[
                  { value: '', label: t('settings.values.default') },
                  { value: 'thinking_type', label: 'thinking_type' },
                  { value: 'enable_thinking', label: 'enable_thinking' },
                  { value: 'reasoning_split', label: 'reasoning_split' },
                ]}
                title={t('settings.providers.thinkingStyle')}
                value={form.thinkingStyle}
              />
            </View>
          ) : null}
          {enabled.has('proxy') ? (
            <View style={styles.fieldStack}>
              <FieldLabel colors={colors}>{t('settings.providers.proxy')}</FieldLabel>
              <SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(proxy) => onChange({ proxy })} placeholder="http://127.0.0.1:7890" value={form.proxy} />
            </View>
          ) : null}
          {enabled.has('region') ? (
            <View style={styles.fieldStack}>
              <FieldLabel colors={colors}>{t('settings.providers.region')}</FieldLabel>
              <SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(region) => onChange({ region })} value={form.region} />
            </View>
          ) : null}
          {enabled.has('profile') ? (
            <View style={styles.fieldStack}>
              <FieldLabel colors={colors}>{t('settings.providers.profile')}</FieldLabel>
              <SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(profile) => onChange({ profile })} value={form.profile} />
            </View>
          ) : null}
          {enabled.has('extra_headers') ? (
            <View style={styles.fieldStack}>
              <FieldLabel colors={colors}>{t('settings.providers.extraHeaders')} (JSON)</FieldLabel>
              <SettingsInput colors={colors} multiline onChangeText={(extraHeaders) => onChange({ extraHeaders })} placeholder={'{\n  "X-Header": "value"\n}'} style={styles.jsonInput} value={form.extraHeaders} />
            </View>
          ) : null}
          {enabled.has('extra_body') ? (
            <View style={styles.fieldStack}>
              <FieldLabel colors={colors}>{t('settings.providers.extraBody')} (JSON)</FieldLabel>
              <SettingsInput colors={colors} multiline onChangeText={(extraBody) => onChange({ extraBody })} placeholder="{}" style={styles.jsonInput} value={form.extraBody} />
            </View>
          ) : null}
          {enabled.has('extra_query') ? (
            <View style={styles.fieldStack}>
              <FieldLabel colors={colors}>{t('settings.providers.extraQuery')} (JSON)</FieldLabel>
              <SettingsInput colors={colors} multiline onChangeText={(extraQuery) => onChange({ extraQuery })} placeholder="{}" style={styles.jsonInput} value={form.extraQuery} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  advancedBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 13 },
  advancedHeader: { minHeight: 48, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  advancedPanel: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  advancedTitle: { fontSize: 13, fontWeight: '700' },
  fieldStack: { gap: 6 },
  helpText: { fontSize: 11.5, lineHeight: 17 },
  inlineField: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  jsonInput: { minHeight: 86, textAlignVertical: 'top', fontFamily: 'monospace' },
});
