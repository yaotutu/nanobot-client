import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Play,
  Search,
  Square,
} from 'lucide-react-native';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  fetchApiService,
  fetchSettings,
  startApiService,
  stopApiService,
  updateSettings,
} from '@/features/settings/api';
import {
  fetchNanobotFeatures,
  setNanobotFeatureEnabled,
} from '@/features/channels/api';
import { restartRequirementDescription, type RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type { ApiServicePayload, NanobotFeatureInfo, SettingsPayload } from '@/types/api';

import type { SettingsPalette } from '@/features/settings/types';
import {
  SegmentedControl,
  SettingsButton,
  SettingsInput,
  SettingsNotice,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusPill,
} from './settings-controls';

interface RuntimeSettingsProps {
  colors: SettingsPalette;
  settings: SettingsPayload;
  onSettingsChange: (settings: SettingsPayload) => void;
  onRestart: () => void;
  runtimePolicy: RuntimeClientPolicy;
}

interface TimezoneOption {
  name: string;
  offset: string;
  searchText: string;
}

const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function loopback(host: string): boolean {
  const value = host.trim().toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1' || value === '[::1]';
}

function timezoneOffset(timezone: string, t: TFunction): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date());
    const value = parts.find((part) => part.type === 'timeZoneName')?.value;
    return value ? value.replace(/^GMT$/, 'UTC').replace(/^GMT/, 'UTC') : 'UTC';
  } catch {
    return t('settings.timezone.custom', { defaultValue: 'Custom timezone' });
  }
}

function timezoneOptions(current: string, t: TFunction): TimezoneOption[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[];
  };
  let supported: string[];
  try {
    supported = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    supported = [];
  }
  const names = Array.from(new Set([...FALLBACK_TIMEZONES, ...supported, current].filter(Boolean)))
    .sort((left, right) => {
      if (left === 'UTC') return -1;
      if (right === 'UTC') return 1;
      return left.localeCompare(right);
    });
  return names.map((name) => {
    const offset = timezoneOffset(name, t);
    return {
      name,
      offset,
      searchText: `${name} ${name.replace(/_/g, ' ')} ${offset}`.toLowerCase(),
    };
  });
}

export function RuntimeSettings({ colors, settings, onSettingsChange, onRestart, runtimePolicy }: RuntimeSettingsProps) {
  const { t } = useTranslation();
  const [botName, setBotName] = useState(settings.agent.bot_name);
  const [botIcon, setBotIcon] = useState(settings.agent.bot_icon);
  const [timezone, setTimezone] = useState(settings.agent.timezone);
  const [saving, setSaving] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [api, setApi] = useState<ApiServicePayload | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiAction, setApiAction] = useState<'start' | 'stop' | null>(null);
  const [apiHost, setApiHost] = useState(settings.api?.host ?? '127.0.0.1');
  const [apiPort, setApiPort] = useState(String(settings.api?.port ?? 8900));
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [langfuse, setLangfuse] = useState<NanobotFeatureInfo | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [featureAction, setFeatureAction] = useState(false);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [featureRestartPending, setFeatureRestartPending] = useState(false);
  const dirty = botName !== settings.agent.bot_name || botIcon !== settings.agent.bot_icon || timezone !== settings.agent.timezone;

  useEffect(() => {
    let cancelled = false;
    fetchApiService()
      .then((payload) => {
        if (cancelled) return;
        setApi(payload);
        setApiHost(payload.host);
        setApiPort(String(payload.port));
        setApiError(null);
      })
      .catch((caught) => {
        if (!cancelled) setApiError(caught instanceof Error ? caught.message : t('settings.status.loadError'));
      })
      .finally(() => {
        if (!cancelled) setApiLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    fetchNanobotFeatures()
      .then((payload) => {
        if (cancelled) return;
        setLangfuse(payload.features.find((feature) => feature.name === 'langfuse') ?? null);
        setFeatureRestartPending(Boolean(payload.requires_restart));
        setFeatureError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : t('settings.status.loadError');
        if (message !== 'HTTP 404') setFeatureError(message);
      })
      .finally(() => {
        if (!cancelled) setFeaturesLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  const saveIdentity = async () => {
    if (!dirty) return;
    setSaving(true);
    setIdentityError(null);
    try {
      const next = await updateSettings({ botName, botIcon, timezone });
      onSettingsChange(next);
    } catch (caught) {
      setIdentityError(caught instanceof Error ? caught.message : t('settings.status.unsaved'));
    } finally {
      setSaving(false);
    }
  };

  const parsedPort = Number.parseInt(apiPort, 10);
  const apiInputValid = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535;
  const apiNetworkAccess = !loopback(apiHost);
  const requiresNetworkKey = apiNetworkAccess && !apiKey.trim() && !(api?.api_key_hint ?? settings.api?.api_key_hint);

  const changeApiState = async (action: 'start' | 'stop') => {
    if (action === 'start' && (!apiInputValid || requiresNetworkKey)) return;
    setApiAction(action);
    setApiError(null);
    try {
      const next = action === 'start'
        ? await startApiService({
            host: apiHost.trim(),
            port: parsedPort,
            timeout: api?.timeout ?? settings.api?.timeout ?? 120,
            apiKey: apiKey.trim() || undefined,
          })
        : await stopApiService();
      setApi(next);
      setApiHost(next.host);
      setApiPort(String(next.port));
      setApiKey('');
      setApiKeyVisible(false);
    } catch (caught) {
      setApiError(caught instanceof Error ? caught.message : t('settings.status.unsaved'));
    } finally {
      setApiAction(null);
    }
  };

  const enableLangfuse = async () => {
    if (featureAction) return;
    setFeatureAction(true);
    setFeatureError(null);
    try {
      const payload = await setNanobotFeatureEnabled('enable', 'langfuse');
      setLangfuse(payload.features.find((feature) => feature.name === 'langfuse') ?? null);
      setFeatureRestartPending(Boolean(payload.requires_restart));
      try {
        onSettingsChange(await fetchSettings());
      } catch {
        // The feature result remains authoritative even when refreshing settings fails.
      }
    } catch (caught) {
      setFeatureError(caught instanceof Error ? caught.message : t('settings.status.unsaved'));
    } finally {
      setFeatureAction(false);
    }
  };

  const pending = Boolean(settings.apply_state?.status === 'pending' || settings.requires_restart || featureRestartPending);
  const engineState = settings.apply_state?.status === 'restarting_engine'
    ? t('settings.values.restartingEngine')
    : pending
      ? t('settings.values.restartPending')
      : t('settings.values.ready');

  return (
    <SettingsPage>
      <SettingsSection colors={colors} title={t('settings.sections.identity')}>
        <SettingsRow colors={colors} description={t('settings.help.botName')} title={t('settings.rows.botName')}>
          <SettingsInput colors={colors} onChangeText={setBotName} style={styles.nameInput} value={botName} />
        </SettingsRow>
        <SettingsRow colors={colors} description={t('settings.help.botIcon')} title={t('settings.rows.botIcon')}>
          <SettingsInput colors={colors} onChangeText={setBotIcon} style={styles.iconInput} textAlign="center" value={botIcon} />
        </SettingsRow>
        <SettingsRow colors={colors} description={t('settings.help.timezone')} last title={t('settings.rows.timezone')}>
          <TimezonePicker colors={colors} onChange={setTimezone} value={timezone} />
        </SettingsRow>
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <SettingsButton colors={colors} disabled={!dirty || saving} label={saving ? t('settings.actions.saving') : t('settings.actions.save')} onPress={() => void saveIdentity()} primary />
          {pending ? <SettingsButton colors={colors} disabled={!runtimePolicy.canRestart} label={runtimePolicy.restartLabel} onPress={onRestart} /> : null}
        </View>
        {dirty ? <Text selectable style={[styles.footerMessage, { color: colors.muted }]}>{runtimePolicy.isNativeHost ? t('settings.status.hostRestartAfterSaving') : t('settings.status.restartAfterSaving')}</Text> : null}
        {pending ? <Text selectable style={[styles.footerMessage, { color: colors.muted }]}>{restartRequirementDescription(runtimePolicy)}</Text> : null}
        {identityError ? <SettingsNotice colors={colors} error message={identityError} /> : null}
      </SettingsSection>

      {runtimePolicy.isNativeHost ? (
        <SettingsSection colors={colors} title={t('settings.sections.nativeHost')}>
          <SettingsRow colors={colors} last={!runtimePolicy.declaredHostActions.openLogs && !runtimePolicy.declaredHostActions.exportDiagnostics} title={t('settings.rows.engine')}>
            <StatusPill colors={colors} label={engineState} tone={pending ? 'warning' : 'success'} />
          </SettingsRow>
          {runtimePolicy.declaredHostActions.openLogs ? <SettingsRow colors={colors} description={t('settings.status.hostApiUnavailable')} last={!runtimePolicy.declaredHostActions.exportDiagnostics} title={t('settings.rows.logs')}><StatusPill colors={colors} label={t('settings.values.notAvailable')} /></SettingsRow> : null}
          {runtimePolicy.declaredHostActions.exportDiagnostics ? <SettingsRow colors={colors} description={t('settings.status.hostApiUnavailable')} last title={t('settings.rows.diagnostics')}><StatusPill colors={colors} label={t('settings.values.notAvailable')} /></SettingsRow> : null}
          {runtimePolicy.restartUnavailableReason ? <Text selectable style={[styles.sectionHelp, { color: colors.muted }]}>{runtimePolicy.restartUnavailableReason}</Text> : null}
        </SettingsSection>
      ) : null}

      <SettingsSection colors={colors} title={t('settings.api.title')}>
        <View style={[styles.serviceRow, { borderBottomColor: colors.border }]}>
          <View style={styles.serviceCopy}>
            <Text selectable style={[styles.serviceTitle, { color: colors.foreground }]}>{t('settings.api.openaiCompatible')}</Text>
            <Text selectable style={[styles.serviceDescription, { color: colors.subtle }]}>{apiError ?? (api?.running ? api.endpoint : t('settings.api.description'))}</Text>
          </View>
          <StatusPill colors={colors} label={apiLoading ? t('settings.channels.checking') : api?.running ? t('settings.channels.filterOn') : t('settings.channels.runtimeStopped')} tone={api?.running ? 'success' : 'neutral'} />
          {apiLoading ? <ActivityIndicator color={colors.muted} size="small" /> : (
            <Pressable
              accessibilityRole="button"
              disabled={apiAction !== null || (!api?.running && (!apiInputValid || requiresNetworkKey))}
              onPress={() => void changeApiState(api?.running ? 'stop' : 'start')}
              style={({ pressed }) => [styles.serviceAction, { borderColor: colors.border, backgroundColor: colors.background, opacity: apiAction !== null ? 0.45 : pressed ? 0.72 : 1 }]}
            >
              {apiAction ? <ActivityIndicator color={colors.foreground} size="small" /> : api?.running ? <Square color={colors.foreground} size={14} /> : <Play color={colors.foreground} size={14} />}
              <Text style={[styles.serviceActionLabel, { color: colors.foreground }]}>{apiAction === 'start' ? t('settings.api.starting') : apiAction === 'stop' ? t('settings.api.stopping') : api?.running ? t('settings.api.stop') : t('settings.api.start')}</Text>
            </Pressable>
          )}
        </View>
        {!apiLoading && !api?.running ? (
          <>
            <SettingsRow colors={colors} description={apiNetworkAccess ? t('settings.api.networkHelp') : t('settings.api.localHelp')} title={t('settings.api.access')}>
              <SegmentedControl
                colors={colors}
                onChange={(value) => setApiHost(value === 'network' ? '0.0.0.0' : '127.0.0.1')}
                options={[{ value: 'local', label: t('settings.api.thisDevice') }, { value: 'network', label: t('settings.api.localNetwork') }]}
                value={apiNetworkAccess ? 'network' : 'local'}
              />
            </SettingsRow>
            <SettingsRow colors={colors} description={t('settings.api.portHelp')} last={!apiNetworkAccess} title={t('settings.api.port')}>
              <SettingsInput colors={colors} keyboardType="number-pad" onChangeText={setApiPort} style={styles.portInput} value={apiPort} />
            </SettingsRow>
            {apiNetworkAccess ? (
              <SettingsRow colors={colors} description={requiresNetworkKey ? t('settings.api.apiKeyRequired') : t('settings.api.apiKeyHelp')} last title={t('settings.api.apiKey')}>
                <View style={[styles.secretWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={setApiKey}
                    placeholder={api?.api_key_hint ?? settings.api?.api_key_hint ?? t('settings.api.apiKeyPlaceholder')}
                    placeholderTextColor={colors.subtle}
                    secureTextEntry={!apiKeyVisible}
                    style={[styles.secretInput, { color: colors.foreground }]}
                    value={apiKey}
                  />
                  <Pressable accessibilityLabel={apiKeyVisible ? t('settings.byok.hideApiKey') : t('settings.byok.showApiKey')} onPress={() => setApiKeyVisible((value) => !value)}>
                    {apiKeyVisible ? <EyeOff color={colors.muted} size={17} /> : <Eye color={colors.muted} size={17} />}
                  </Pressable>
                </View>
              </SettingsRow>
            ) : null}
            {!apiInputValid ? <SettingsNotice colors={colors} error message={t('settings.api.portInvalid', { defaultValue: 'Port must be an integer from 1 to 65535.' })} /> : null}
            {requiresNetworkKey ? <SettingsNotice colors={colors} error message={t('settings.api.apiKeyRequired')} /> : null}
            {api?.installed === false ? <Text selectable style={[styles.sectionHelp, { color: colors.muted }]}>{t('settings.api.autoInstall')}</Text> : null}
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection colors={colors} title={t('settings.observability.title')}>
        <SettingsRow colors={colors} description={settings.observability?.configured ? t('settings.observability.configured') : t('settings.observability.environment')} last title="Langfuse">
          {featuresLoading ? <ActivityIndicator color={colors.muted} size="small" /> : langfuse?.installed ? (
            <StatusPill colors={colors} label={settings.observability?.configured ? t('settings.values.ready') : t('settings.values.notConfigured')} tone={settings.observability?.configured ? 'success' : 'neutral'} />
          ) : langfuse ? (
            <SettingsButton colors={colors} disabled={featureAction} label={featureAction ? t('settings.channels.runtimeStarting') : t('settings.observability.enable')} onPress={() => void enableLangfuse()} />
          ) : (
            <StatusPill colors={colors} label={t('settings.values.notAvailable')} />
          )}
        </SettingsRow>
        {featureError ? <SettingsNotice colors={colors} error message={featureError} /> : null}
      </SettingsSection>

      <SettingsSection colors={colors} title={t('settings.sections.system')}>
        {!runtimePolicy.isNativeHost ? <ReadOnlyRow colors={colors} label="Gateway" value={`${settings.runtime.gateway_host}:${settings.runtime.gateway_port}`} /> : null}
        <ReadOnlyRow colors={colors} label={t('settings.rows.configPath')} value={settings.runtime.config_path} />
        <ReadOnlyRow colors={colors} label={t('settings.rows.workspacePath')} value={settings.runtime.workspace_path} last={!runtimePolicy.canRestart || pending} />
        {runtimePolicy.canRestart && !pending ? (
          <View style={styles.systemRestartRow}>
            <View style={styles.serviceCopy}>
              <Text style={[styles.serviceTitle, { color: colors.foreground }]}>{t('app.system.restart')}</Text>
              <Text style={[styles.serviceDescription, { color: colors.subtle }]}>{t('app.system.restartHint')}</Text>
            </View>
            <SettingsButton colors={colors} label={runtimePolicy.restartLabel} onPress={onRestart} />
          </View>
        ) : null}
      </SettingsSection>
    </SettingsPage>
  );
}

function TimezonePicker({ colors, value, onChange }: { colors: SettingsPalette; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const options = useMemo(() => timezoneOptions(value, t), [t, value]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? options.filter((option) => option.searchText.includes(normalized)) : options;
  }, [options, query]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.timezoneButton, { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}
      >
        <Text numberOfLines={1} style={[styles.timezoneValue, { color: colors.foreground }]}>{value || t('settings.timezone.select')}</Text>
        <ChevronDown color={colors.muted} size={14} />
      </Pressable>
      <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable onPress={() => setOpen(false)} style={styles.modalBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.timezoneSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t('settings.timezone.select')}</Text>
            <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Search color={colors.muted} size={16} />
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setQuery} placeholder={t('settings.timezone.search')} placeholderTextColor={colors.subtle} style={[styles.searchInput, { color: colors.foreground }]} value={query} />
            </View>
            <ScrollView contentContainerStyle={styles.timezoneList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {filtered.length ? filtered.map((option) => {
                const selected = option.name === value;
                return (
                  <Pressable
                    key={option.name}
                    onPress={() => {
                      onChange(option.name);
                      setQuery('');
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.timezoneOption, { backgroundColor: selected ? colors.pressed : pressed ? colors.card : 'transparent' }]}
                  >
                    <Text numberOfLines={1} style={[styles.timezoneName, { color: colors.foreground }]}>{option.name}</Text>
                    <Text style={[styles.timezoneOffset, { color: colors.muted }]}>{option.offset}</Text>
                    {selected ? <Check color={colors.foreground} size={17} /> : null}
                  </Pressable>
                );
              }) : <Text style={[styles.emptyTimezone, { color: colors.muted }]}>{t('settings.timezone.empty')}</Text>}
            </ScrollView>
            <SettingsButton colors={colors} label={t('settings.actions.cancel')} onPress={() => { setQuery(''); setOpen(false); }} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ReadOnlyRow({ colors, label, value, last = false }: { colors: SettingsPalette; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.readOnlyRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.readOnlyLabel, { color: colors.foreground }]}>{label}</Text>
      <Text selectable style={[styles.readOnlyValue, { color: colors.muted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nameInput: { width: 210 },
  iconInput: { width: 110 },
  portInput: { width: 104, textAlign: 'right' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  footerMessage: { paddingHorizontal: 14, paddingBottom: 10, fontSize: 11.5, lineHeight: 17 },
  sectionHelp: { paddingHorizontal: 14, paddingTop: 1, paddingBottom: 12, fontSize: 11.5, lineHeight: 17 },
  serviceRow: { minHeight: 82, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9 },
  serviceCopy: { flex: 1, minWidth: 150 },
  serviceTitle: { fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
  serviceDescription: { marginTop: 3, fontSize: 11.5, lineHeight: 16 },
  serviceAction: { minHeight: 36, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  serviceActionLabel: { fontSize: 12, fontWeight: '700' },
  secretWrap: { minHeight: 42, width: 220, maxWidth: '100%', borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secretInput: { flex: 1, minHeight: 40, paddingVertical: 0, fontSize: 13 },
  systemRestartRow: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  readOnlyRow: { minHeight: 62, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  readOnlyLabel: { width: 90, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  readOnlyValue: { flex: 1, textAlign: 'right', fontSize: 12, lineHeight: 18 },
  timezoneButton: { minHeight: 38, width: 210, maxWidth: '100%', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  timezoneValue: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.34)' },
  timezoneSheet: { height: '82%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, gap: 12 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3, marginBottom: 4 },
  sheetTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  searchWrap: { minHeight: 42, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minHeight: 40, paddingVertical: 0, fontSize: 13 },
  timezoneList: { paddingVertical: 2 },
  timezoneOption: { minHeight: 50, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  timezoneName: { flex: 1, fontSize: 13, fontWeight: '600' },
  timezoneOffset: { fontSize: 11.5, fontWeight: '600' },
  emptyTimezone: { paddingVertical: 28, textAlign: 'center', fontSize: 12.5 },
});
