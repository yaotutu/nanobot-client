import { Check, CircleAlert, RefreshCw, ShieldCheck, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { fetchPairingRequests, runPairingAction } from '@/features/channels/api';
import { updateNetworkSafetySettings } from '@/features/settings/api';
import type { RuntimeClientPolicy } from '@/services/runtime-capabilities';
import type { PairingPayload, SettingsPayload, WebuiDefaultAccessMode } from '@/types/api';

import type { SettingsPalette } from '../settings-screen';

interface SecuritySettingsProps {
  colors: SettingsPalette;
  settings: SettingsPayload;
  onSettingsChange: (settings: SettingsPayload) => void;
  onRestart: () => void;
  runtimePolicy: RuntimeClientPolicy;
}

export function SecuritySettings({ colors, settings, onSettingsChange, onRestart, runtimePolicy }: SecuritySettingsProps) {
  const { t } = useTranslation();
  const settingsAllowLocal = settings.advanced.webui_allow_local_service_access ?? settings.advanced.allow_local_preview_access ?? true;
  const settingsAccessMode: WebuiDefaultAccessMode = settings.advanced.webui_default_access_mode === 'full' ? 'full' : 'default';
  const [allowLocal, setAllowLocal] = useState(settingsAllowLocal);
  const [accessMode, setAccessMode] = useState<WebuiDefaultAccessMode>(settingsAccessMode);
  const [saving, setSaving] = useState(false);
  const [pairing, setPairing] = useState<PairingPayload | null>(null);
  const [pairingLoading, setPairingLoading] = useState(true);
  const [pairingAction, setPairingAction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const dirty = allowLocal !== settingsAllowLocal || accessMode !== settingsAccessMode;

  const loadPairing = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      setPairing(await fetchPairingRequests());
      setPairingError(null);
    } catch (caught) {
      setPairingError(caught instanceof Error ? caught.message : t('settings.security.loadPairingFailed', { defaultValue: 'Could not load pairing requests.' }));
    } finally {
      setPairingLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      fetchPairingRequests()
        .then((next) => {
          if (!cancelled) {
            setPairing(next);
            setPairingError(null);
          }
        })
        .catch((caught) => {
          if (!cancelled) setPairingError(caught instanceof Error ? caught.message : t('settings.security.loadPairingFailed', { defaultValue: 'Could not load pairing requests.' }));
        })
        .finally(() => {
          if (!cancelled) setPairingLoading(false);
        });
    };
    const startPolling = () => {
      if (timer) clearInterval(timer);
      refresh();
      timer = setInterval(refresh, 5_000);
    };
    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    if (AppState.currentState === 'active') startPolling();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') startPolling();
      else stopPolling();
    });
    return () => {
      cancelled = true;
      stopPolling();
      subscription.remove();
    };
  }, [t]);

  const save = async () => {
    setSaving(true);
    setSafetyError(null);
    try {
      const next = await updateNetworkSafetySettings({
        webuiAllowLocalServiceAccess: allowLocal,
        webuiDefaultAccessMode: accessMode,
      });
      onSettingsChange(next);
    } catch (caught) {
      setSafetyError(caught instanceof Error ? caught.message : t('settings.status.unsaved'));
    } finally {
      setSaving(false);
    }
  };

  const actPairing = async (action: 'approve' | 'deny', code: string) => {
    setPairingAction(`${action}:${code}`);
    setPairingError(null);
    try {
      setPairing(await runPairingAction(action, code));
    } catch (caught) {
      setPairingError(caught instanceof Error ? caught.message : t('settings.security.pairingActionFailed', { defaultValue: 'Pairing action failed.' }));
    } finally {
      setPairingAction(null);
    }
  };

  const advanced = settings.advanced;
  const nativeSurface = (settings.surface ?? settings.runtime_surface) === 'native';

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl colors={[colors.muted]} onRefresh={() => void loadPairing(true)} refreshing={refreshing} tintColor={colors.muted} />}
      showsVerticalScrollIndicator={false}
    >
      {safetyError ? <View style={[styles.error, { backgroundColor: colors.errorBackground }]}><CircleAlert color={colors.errorText} size={16} /><Text style={[styles.errorText, { color: colors.errorText }]}>{safetyError}</Text></View> : null}

      <Section colors={colors} title={nativeSurface ? t('settings.sections.hostSafety') : t('settings.sections.webuiSafety')}>
        <SettingRow colors={colors} description={nativeSurface ? t('settings.help.localServiceAccessNative') : t('settings.help.localServiceAccess')} title={t('settings.rows.localServiceAccess')}>
          <Switch onValueChange={setAllowLocal} thumbColor={allowLocal ? colors.background : '#FFFFFF'} trackColor={{ false: colors.border, true: colors.foreground }} value={allowLocal} />
        </SettingRow>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.settingBlock}>
          <Text style={[styles.settingTitle, { color: colors.foreground }]}>{t('settings.rows.webuiDefaultAccess')}</Text>
          <Text style={[styles.settingDescription, { color: colors.muted }]}>{nativeSurface ? t('settings.help.webuiDefaultAccessNative') : t('settings.help.webuiDefaultAccess')}</Text>
          <View style={styles.segmented}>
            {([
              ['default', t('settings.values.defaultPermission')],
              ['full', t('settings.values.fullAccess')],
            ] as Array<[WebuiDefaultAccessMode, string]>).map(([value, label]) => (
              <Pressable key={value} onPress={() => setAccessMode(value)} style={[styles.segment, { backgroundColor: accessMode === value ? colors.foreground : colors.background, borderColor: colors.border }]}>
                <Text style={[styles.segmentText, { color: accessMode === value ? colors.background : colors.muted }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.actions}>
          <Button colors={colors} disabled={!dirty || saving} label={saving ? t('settings.actions.saving') : t('settings.actions.save')} onPress={() => void save()} primary />
          {(settings.requires_restart || settings.apply_state?.status === 'pending') ? <Button colors={colors} disabled={!runtimePolicy.canRestart} label={runtimePolicy.restartLabel} onPress={onRestart} /> : null}
        </View>
        {dirty ? <Text style={[styles.saveHint, { color: colors.muted }]}>{t('settings.status.restartAfterSaving')}</Text> : null}
        {(settings.requires_restart || settings.apply_state?.status === 'pending') ? <Text style={[styles.saveHint, { color: colors.muted }]}>{runtimePolicy.restartUnavailableReason ?? t('settings.status.savedRestartApply')}</Text> : null}
      </Section>

      <Section colors={colors} title={t('settings.security.managedProtections', { defaultValue: 'Managed protections' })}>
        <View style={styles.protectionHeader}><ShieldCheck color="#16865C" size={20} /><View style={styles.protectionCopy}><Text style={[styles.protectionTitle, { color: colors.foreground }]}>{t('settings.security.privateServiceProtection', { defaultValue: 'Private service protection' })} · {advanced.private_service_protection_enabled ? t('settings.values.on') : t('settings.values.off')}</Text><Text style={[styles.settingDescription, { color: colors.muted }]}>{t('settings.help.securityManagedControls')}</Text></View></View>
        <ReadOnly colors={colors} label={t('settings.security.workspaceRestriction', { defaultValue: 'Workspace restriction' })} value={advanced.restrict_to_workspace ? t('settings.values.on') : t('settings.values.off')} />
        <ReadOnly colors={colors} label={t('settings.security.sandboxLevel', { defaultValue: 'Sandbox level' })} value={advanced.workspace_sandbox?.level ?? advanced.exec_sandbox ?? t('settings.values.notConfigured')} />
        <ReadOnly colors={colors} label={t('settings.security.commandExecution', { defaultValue: 'Command execution' })} value={advanced.exec_enabled ? t('settings.values.on') : t('settings.values.off')} />
        <ReadOnly colors={colors} label={t('settings.security.ssrfAllowlist', { defaultValue: 'SSRF allowlist' })} value={t('settings.security.itemCount', { count: advanced.ssrf_whitelist_count, defaultValue: '{{count}} items' })} />
        <ReadOnly colors={colors} label={t('settings.sections.mcp')} value={t('settings.security.serviceCount', { count: advanced.mcp_server_count, defaultValue: '{{count}} services' })} />
      </Section>

      <Section colors={colors} title={t('thread.composer.slash.commands.pairing.title')}>
        {pairingError ? <View style={[styles.inlineError, { backgroundColor: colors.errorBackground }]}><CircleAlert color={colors.errorText} size={15} /><Text style={[styles.inlineErrorText, { color: colors.errorText }]}>{pairingError}</Text></View> : null}
        {pairing?.last_action ? <View style={[styles.actionMessage, { backgroundColor: pairing.last_action.ok ? '#E6F5EE' : colors.errorBackground }]}><Text style={[styles.actionMessageText, { color: pairing.last_action.ok ? '#16865C' : colors.errorText }]}>{pairing.last_action.message}</Text></View> : null}
        <View style={styles.pairingHeader}><Text style={[styles.settingDescription, { color: colors.muted }]}>{t('thread.composer.slash.commands.pairing.description')}</Text><Pressable accessibilityLabel={t('settings.security.refreshPairing', { defaultValue: 'Refresh pairing requests' })} onPress={() => void loadPairing(true)} style={styles.refreshButton}>{refreshing ? <ActivityIndicator color={colors.muted} size="small" /> : <RefreshCw color={colors.muted} size={16} />}</Pressable></View>
        {pairingLoading ? <View style={styles.loading}><ActivityIndicator color={colors.muted} /><Text style={{ color: colors.muted }}>{t('settings.security.loadingPairing', { defaultValue: 'Loading pairing requests…' })}</Text></View> : (pairing?.requests ?? []).length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>{t('settings.security.noPairingRequests', { defaultValue: 'No pending pairing requests.' })}</Text> : pairing?.requests.map((request) => (
          <View key={request.code} style={[styles.pairingRow, { backgroundColor: colors.background }]}>
            <View style={styles.pairingCopy}><Text style={[styles.pairingCode, { color: colors.foreground }]}>{request.code}</Text><Text style={[styles.pairingMeta, { color: colors.muted }]}>{request.channel} · {request.sender_id}{request.expires_in_seconds != null ? ` · ${t('settings.security.expiresIn', { count: request.expires_in_seconds, defaultValue: '{{count}}s remaining' })}` : ''}</Text></View>
            <Pressable accessibilityLabel={t('settings.security.approvePairing', { code: request.code, defaultValue: 'Approve pairing {{code}}' })} disabled={pairingAction !== null} onPress={() => void actPairing('approve', request.code)} style={[styles.iconAction, { backgroundColor: '#E6F5EE' }]}>{pairingAction === `approve:${request.code}` ? <ActivityIndicator color="#16865C" size="small" /> : <Check color="#16865C" size={17} />}</Pressable>
            <Pressable accessibilityLabel={t('settings.security.denyPairing', { code: request.code, defaultValue: 'Deny pairing {{code}}' })} disabled={pairingAction !== null} onPress={() => void actPairing('deny', request.code)} style={[styles.iconAction, { backgroundColor: colors.errorBackground }]}>{pairingAction === `deny:${request.code}` ? <ActivityIndicator color={colors.errorText} size="small" /> : <X color={colors.errorText} size={17} />}</Pressable>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({ colors, title, children }: { colors: SettingsPalette; title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={[styles.sectionLabel, { color: colors.muted }]}>{title}</Text><View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View></View>;
}

function SettingRow({ colors, title, description, children }: { colors: SettingsPalette; title: string; description: string; children: React.ReactNode }) {
  return <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.settingDescription, { color: colors.muted }]}>{description}</Text></View>{children}</View>;
}

function ReadOnly({ colors, label, value }: { colors: SettingsPalette; label: string; value: string }) {
  return <View style={styles.readOnly}><Text style={[styles.readOnlyLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.readOnlyValue, { color: colors.foreground }]}>{value}</Text></View>;
}

function Button({ colors, label, onPress, disabled = false, primary = false }: { colors: SettingsPalette; label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: primary ? colors.foreground : colors.background, borderColor: colors.border, opacity: disabled ? 0.45 : pressed ? 0.72 : 1 }]}><Text style={[styles.buttonText, { color: primary ? colors.background : colors.foreground }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 38 },
  error: { marginBottom: 14, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  section: { marginBottom: 23, gap: 8 },
  sectionLabel: { paddingHorizontal: 3, fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 20, padding: 14, gap: 14 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  settingBlock: { gap: 7 },
  settingCopy: { flex: 1, minWidth: 0, gap: 3 },
  settingTitle: { fontSize: 13, fontWeight: '700' },
  settingDescription: { fontSize: 11.5, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth },
  segmented: { marginTop: 3, flexDirection: 'row', gap: 7 },
  segment: { minHeight: 37, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 11.5, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  saveHint: { fontSize: 11.5, lineHeight: 17 },
  button: { minHeight: 39, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 12.5, fontWeight: '700' },
  protectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  protectionCopy: { flex: 1, gap: 3 },
  protectionTitle: { fontSize: 13, fontWeight: '700' },
  readOnly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  readOnlyLabel: { fontSize: 12 },
  readOnlyValue: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '600' },
  pairingHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  inlineError: { borderRadius: 12, padding: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  inlineErrorText: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  actionMessage: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  actionMessageText: { fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  refreshButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  loading: { minHeight: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  empty: { paddingVertical: 18, textAlign: 'center', fontSize: 12.5 },
  pairingRow: { borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pairingCopy: { flex: 1, minWidth: 0 },
  pairingCode: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  pairingMeta: { marginTop: 3, fontSize: 11, lineHeight: 16 },
  iconAction: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
