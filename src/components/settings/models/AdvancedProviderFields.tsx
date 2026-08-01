import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProviderAdvancedField } from '@/types/api';

import type { SettingsPalette } from '../../settings-screen';
import { SegmentedControl, SettingsInput, SettingsPicker } from '../settings-controls';
import { FieldLabel } from './ModelsShared';
import type { ProviderApiType, ProviderForm } from './models-utils';

export function AdvancedProviderFields({ colors, fields, form, onChange }: {
  colors: SettingsPalette;
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
  jsonInput: { minHeight: 86, textAlignVertical: 'top', fontFamily: 'monospace' },
});
