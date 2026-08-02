import { ArrowUpCircle, Bot, HardDrive, Image, Mic, Server, Search } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { checkVersion } from '@/features/settings/api';
import type { SettingsPayload } from '@/types/api/settings';

import type { SettingsPalette, SettingsSectionKey } from '@/features/settings/types';
import { SettingsButton, SettingsPage, SettingsSection } from './settings-controls';
import { TokenUsageHeatmap } from './token-usage-heatmap';

function providerLabel(rows: Array<{ name: string; label: string }>, name: string, fallback: string): string {
  return rows.find((row) => row.name === name)?.label || name || fallback;
}

function shortPath(path: string, fallback: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : path || fallback;
}

export function OverviewSettings({ colors, settings, onSelectSection }: {
  colors: SettingsPalette;
  settings: SettingsPayload;
  onSelectSection: (section: SettingsSectionKey) => void;
}) {
  const { t } = useTranslation();
  const activeProvider = settings.agent.resolved_provider ?? settings.agent.provider;
  const provider = settings.providers.find((row) => row.name === activeProvider);
  const preset = settings.agent.model_preset && settings.agent.model_preset !== 'default'
    ? settings.model_presets.find((row) => row.name === settings.agent.model_preset)?.label ?? settings.agent.model_preset
    : null;
  const webProvider = settings.web_search.providers.find((row) => row.name === settings.web_search.provider)
    ?? settings.web_search.providers[0];
  const webCredential = webProvider?.credential === 'none'
    ? t('settings.byok.webSearch.noCredentialRequired')
    : webProvider?.credential === 'optional_api_key'
      ? settings.web_search.api_key_hint ? t('settings.values.configured') : t('settings.byok.webSearch.noCredentialRequired')
      : webProvider?.credential === 'base_url'
        ? settings.web_search.base_url ? t('settings.values.configured') : t('settings.values.notConfigured')
        : settings.web_search.api_key_hint ? t('settings.values.configured') : t('settings.values.notConfigured');
  const transcription = settings.transcription;
  const native = (settings.surface ?? settings.runtime_surface) === 'native';

  return (
    <SettingsPage>
      <View style={[styles.usageCard, { backgroundColor: colors.card }]}>
        <TokenUsageHeatmap colors={colors} timeZone={settings.agent.timezone} usage={settings.usage} />
      </View>

      <SettingsSection colors={colors} title={t('settings.sections.ai')}>
        <OverviewRow
          colors={colors}
          icon={<Bot color={colors.muted} size={18} />}
          title={t('settings.overview.model')}
          value={provider?.configured ? settings.agent.model : t('settings.values.notConfigured')}
          caption={[providerLabel(settings.providers, activeProvider, t('settings.values.notConfigured')), preset].filter(Boolean).join(' · ')}
          onPress={() => onSelectSection('models')}
        />
      </SettingsSection>

      <SettingsSection colors={colors} title={t('settings.sections.capabilities')}>
        <OverviewRow colors={colors} icon={<Search color={colors.muted} size={18} />} title={t('settings.overview.webSearch')} value={settings.web.enable ? t('settings.values.enabled') : t('settings.values.disabled')} caption={`${providerLabel(settings.web_search.providers, settings.web_search.provider, t('settings.values.notConfigured'))} · ${webCredential}`} onPress={() => onSelectSection('web')} />
        <OverviewRow colors={colors} icon={<Image color={colors.muted} size={18} />} title={t('settings.overview.imageGeneration')} value={settings.image_generation.enabled ? t('settings.values.enabled') : t('settings.values.disabled')} caption={`${providerLabel(settings.image_generation.providers, settings.image_generation.provider, t('settings.values.notConfigured'))} · ${settings.image_generation.provider_configured ? t('settings.values.configured') : t('settings.values.notConfigured')}`} onPress={() => onSelectSection('image')} />
        <OverviewRow colors={colors} icon={<Mic color={colors.muted} size={18} />} last title={t('settings.overview.voiceInput')} value={transcription?.enabled ? t('settings.values.enabled') : t('settings.values.disabled')} caption={transcription ? `${providerLabel(transcription.providers, transcription.provider, t('settings.values.notConfigured'))} · ${transcription.provider_configured ? t('settings.values.configured') : t('settings.values.notConfigured')}` : t('settings.values.notAvailable')} onPress={() => onSelectSection('voice')} />
      </SettingsSection>

      <SettingsSection colors={colors} title={t('settings.sections.system')}>
        <OverviewRow colors={colors} icon={<Server color={colors.muted} size={18} />} title={native ? t('settings.rows.engine') : t('settings.rows.gateway')} value={native ? t('settings.values.privateEngine') : `${settings.runtime.gateway_host}:${settings.runtime.gateway_port}`} caption={native ? t('settings.values.unixSocket') : settings.requires_restart ? t('settings.values.restartPending') : t('settings.values.ready')} onPress={() => onSelectSection('runtime')} />
        <OverviewRow colors={colors} icon={<HardDrive color={colors.muted} size={18} />} last title={t('settings.overview.workspace')} value={t('settings.values.defaultWorkspace')} caption={shortPath(settings.runtime.workspace_path, t('settings.values.notAvailable'))} onPress={() => onSelectSection('runtime')} />
      </SettingsSection>

      <SettingsSection colors={colors} title={t('settings.sections.about')}>
        <VersionRow colors={colors} currentVersion={settings.version?.current} />
      </SettingsSection>
    </SettingsPage>
  );
}

function OverviewRow({ colors, icon, title, value, caption, onPress, last = false }: {
  colors: SettingsPalette;
  icon: React.ReactNode;
  title: string;
  value: string;
  caption: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: colors.pressed }]}>
      <View style={[styles.icon, { backgroundColor: colors.pressed }]}>{icon}</View>
      <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text numberOfLines={1} style={[styles.rowCaption, { color: colors.subtle }]}>{caption}</Text></View>
      <Text numberOfLines={1} style={[styles.rowValue, { color: colors.muted }]}>{value}</Text>
    </Pressable>
  );
}

function VersionRow({ colors, currentVersion }: { colors: SettingsPalette; currentVersion?: string }) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const run = async () => {
    setChecking(true);
    setResult(null);
    try {
      const payload = await checkVersion();
      setError(false);
      setResult(payload.updateAvailable
        ? t('settings.about.updateAvailable', { version: payload.updateAvailable.latestVersion })
        : t('settings.about.upToDate'));
    } catch (caught) {
      setError(true);
      setResult(caught instanceof Error ? caught.message : t('settings.status.loadError'));
    } finally {
      setChecking(false);
    }
  };
  return (
    <View style={styles.versionRow}>
      <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('settings.about.version')}</Text><Text style={[styles.rowCaption, { color: colors.subtle }]}>{currentVersion ? `v${currentVersion}` : 'nanobot'}</Text>{result ? <Text style={[styles.versionResult, { color: error ? colors.errorText : '#2F8F61' }]}>{result}</Text> : null}</View>
      {checking ? <ActivityIndicator color={colors.muted} /> : <SettingsButton colors={colors} label={t('settings.about.checkForUpdates')} onPress={() => void run()} />}
      {!checking ? <ArrowUpCircle color={colors.subtle} size={16} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  usageCard: { borderRadius: 22, padding: 16 },
  row: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13.5, fontWeight: '700' },
  rowCaption: { marginTop: 3, fontSize: 11.5, lineHeight: 16 },
  rowValue: { maxWidth: '34%', textAlign: 'right', fontSize: 12.5, fontWeight: '600' },
  versionRow: { minHeight: 76, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  versionResult: { marginTop: 5, fontSize: 11.5 },
});
