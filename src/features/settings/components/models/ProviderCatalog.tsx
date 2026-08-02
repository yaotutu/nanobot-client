import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { fetchProviderModels } from '@/features/settings/api';
import type {
  ProviderModelsPayload,
  ProviderSettingsInfo,
} from '@/types/api/settings';

import type { SettingsPalette } from '@/features/settings/types';
import { SettingsButton } from '../settings-controls';

export function ProviderCatalog({ colors, provider }: {
  colors: SettingsPalette;
  provider: ProviderSettingsInfo;
}) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<ProviderModelsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setPayload(await fetchProviderModels(provider.name));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.models.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.catalogBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.catalogHeader}>
        <View style={styles.rowCopy}>
          <Text style={[styles.smallTitle, { color: colors.foreground }]}>{t('settings.models.selectModel')}</Text>
          <Text style={[styles.helpText, { color: colors.subtle }]}>{t('settings.models.searchCatalog')}</Text>
        </View>
        <SettingsButton colors={colors} disabled={!provider.configured || loading} label={loading ? t('settings.models.loadingModels') : t('settings.models.loadCatalog', { defaultValue: 'Load catalog' })} onPress={() => void load()} />
      </View>
      {payload ? (
        <View style={styles.catalogList}>
          <Text style={[styles.helpText, { color: colors.muted }]}>{payload.message ?? `${payload.catalog_kind} · ${payload.model_count} ${t('settings.models.modelsAvailable')}`}</Text>
          {payload.models.slice(0, 12).map((model) => (
            <View key={model.id} style={[styles.catalogRow, { borderTopColor: colors.border }]}>
              <Text selectable style={[styles.catalogModel, { color: colors.foreground }]}>{model.label ?? model.id}</Text>
              {model.label && model.label !== model.id ? <Text selectable style={[styles.catalogId, { color: colors.subtle }]}>{model.id}</Text> : null}
            </View>
          ))}
          {payload.models.length > 12 ? <Text style={[styles.helpText, { color: colors.subtle }]}>{payload.models.length - 12} {t('settings.models.modelsAvailable')} · {t('settings.models.selectModel')}</Text> : null}
        </View>
      ) : null}
      {error ? <Text style={[styles.helpText, { color: colors.errorText }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  catalogBox: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 9 },
  catalogHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catalogId: { fontSize: 10.5, lineHeight: 15 },
  catalogList: { gap: 4 },
  catalogModel: { fontSize: 12, fontWeight: '600' },
  catalogRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, gap: 2 },
  helpText: { fontSize: 11.5, lineHeight: 17 },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  smallTitle: { fontSize: 12.5, fontWeight: '700' },
});
