import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SettingsNavigation } from '@/features/settings/components/SettingsNavigation';
import { SettingsSectionRouter } from '@/features/settings/components/SettingsSectionRouter';
import { useSettingsCatalog } from '@/features/settings/hooks/use-settings-catalog';
import { useSettingsUsage } from '@/features/settings/hooks/use-settings-usage';
import type { SettingsSectionKey } from '@/features/settings/types';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import {
  resolveRuntimeClientPolicy,
  type RuntimeMetadata,
} from '@/services/runtime/runtime-capabilities';
import type { SettingsPayload } from '@/types/api/settings';
import type { Palette } from '@/ui/palette';

interface SettingsScreenProps {
  colors: Palette;
  preferences: LocalPreferences;
  onChangePreferences: (preferences: LocalPreferences) => void;
  onRestart: () => void;
  onSettingsChange?: (settings: SettingsPayload) => void;
  runtimeMetadata?: RuntimeMetadata;
}

export function SettingsScreen({
  colors,
  preferences,
  onChangePreferences,
  onRestart,
  onSettingsChange,
  runtimeMetadata,
}: SettingsScreenProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSectionKey>('overview');
  const {
    applySettings,
    applyUsage,
    error,
    load,
    loading,
    refreshing,
    settings,
  } = useSettingsCatalog({ onSettingsChange, runtimeMetadata });
  useSettingsUsage({
    enabled: section === 'overview' && settings !== null,
    onUsage: applyUsage,
  });

  const runtimePolicy = resolveRuntimeClientPolicy(settings, runtimeMetadata);
  const restartUnavailable = Boolean(
    settings
    && !runtimePolicy.canRestart
    && (settings.requires_restart || settings.apply_state?.status === 'pending'),
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SettingsNavigation
        colors={colors}
        onRefresh={() => void load('refresh')}
        onSelect={setSection}
        refreshing={refreshing}
        section={section}
      />
      {error ? (
        <View style={[styles.error, { backgroundColor: colors.errorBackground }]}>
          <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={[styles.retry, { color: colors.errorText }]}>
              {t('settings.channels.checkConnection')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {restartUnavailable ? (
        <View
          style={[
            styles.capabilityNotice,
            { backgroundColor: colors.pressed, borderColor: colors.border },
          ]}
        >
          <Text selectable style={[styles.capabilityNoticeText, { color: colors.muted }]}>
            {runtimePolicy.restartUnavailableReason}
          </Text>
        </View>
      ) : null}
      {loading && !settings ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.muted} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            {t('settings.status.loading')}
          </Text>
        </View>
      ) : settings ? (
        <SettingsSectionRouter
          colors={colors}
          onChangePreferences={onChangePreferences}
          onRestart={onRestart}
          onSelectSection={setSection}
          onSettingsChange={applySettings}
          preferences={preferences}
          runtimePolicy={runtimePolicy}
          section={section}
          settings={settings}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 14,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  retry: { fontSize: 12, fontWeight: '700' },
  capabilityNotice: {
    marginHorizontal: 14,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  capabilityNoticeText: { fontSize: 12, lineHeight: 17 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { fontSize: 12.5 },
});
