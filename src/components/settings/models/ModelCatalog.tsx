import { RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { fetchProviderModels } from '@/features/settings/api';
import type { ProviderModelsPayload, SettingsPayload } from '@/types/api';

import type { SettingsPalette } from '../../settings-screen';
import { SettingsInput, SettingsPicker } from '../settings-controls';
import { IconButton } from './ModelsShared';
import { providerIsConfigured } from './models-utils';

export function ModelCatalog({ colors, settings, provider, value, onChange }: {
  colors: SettingsPalette;
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

const styles = StyleSheet.create({
  fieldStack: { gap: 6 },
  helpText: { fontSize: 11.5, lineHeight: 17 },
  inlineField: { flexDirection: 'row', alignItems: 'center', gap: 7 },
});
