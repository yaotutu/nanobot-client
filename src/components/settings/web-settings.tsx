import { Eye, EyeOff, Pencil } from 'lucide-react-native';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { updateWebSearchSettings } from '@/features/settings/api';
import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type { SettingsPayload, WebSearchProviderInfo, WebSearchSettingsUpdate } from '@/types/api';

import type { SettingsPalette } from '@/features/settings/types';
import { SettingsButton, SettingsInput, SettingsNotice, SettingsPage, SettingsPicker, SettingsRow, SettingsSection, SettingsSwitch, StatusPill } from './settings-controls';

function fromPayload(settings: SettingsPayload): WebSearchSettingsUpdate {
  return {
    provider: settings.web_search.provider,
    baseUrl: settings.web_search.base_url ?? '',
    maxResults: settings.web_search.max_results,
    timeout: settings.web_search.timeout,
    useJinaReader: settings.web.fetch.use_jina_reader,
  };
}

function acceptsKey(provider?: WebSearchProviderInfo): boolean {
  return provider?.credential === 'api_key' || provider?.credential === 'optional_api_key';
}

export function WebSettings({ colors, settings, onSettingsChange, onRestart, runtimePolicy }: {
  colors: SettingsPalette;
  settings: SettingsPayload;
  onSettingsChange: (settings: SettingsPayload) => void;
  onRestart: () => void;
  runtimePolicy: RuntimeClientPolicy;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => fromPayload(settings));
  const [keyEditing, setKeyEditing] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const provider = settings.web_search.providers.find((row) => row.name === form.provider)
    ?? settings.web_search.providers[0];
  const currentProvider = form.provider === settings.web_search.provider;
  const hasExistingSecret = currentProvider && acceptsKey(provider) && Boolean(settings.web_search.api_key_hint);
  const apiKey = form.apiKey?.trim() ?? '';
  const baseUrl = form.baseUrl?.trim() ?? '';
  const dirty = form.provider !== settings.web_search.provider
    || apiKey.length > 0
    || (provider?.credential === 'optional_api_key' && keyEditing && form.apiKey === '')
    || baseUrl !== (settings.web_search.base_url ?? '')
    || form.maxResults !== settings.web_search.max_results
    || form.timeout !== settings.web_search.timeout
    || form.useJinaReader !== settings.web.fetch.use_jina_reader;
  const missingCredential = provider?.credential === 'api_key'
    ? !apiKey && !hasExistingSecret
    : provider?.credential === 'base_url' ? !baseUrl : false;

  const selectProvider = (name: string) => {
    const selected = settings.web_search.providers.find((row) => row.name === name);
    setForm((current) => ({
      ...current,
      provider: name,
      apiKey: undefined,
      baseUrl: selected?.credential === 'base_url' && name === settings.web_search.provider
        ? settings.web_search.base_url ?? ''
        : '',
    }));
    setKeyEditing(false);
    setKeyVisible(false);
    setMessage(null);
  };
  const reset = () => {
    setForm(fromPayload(settings));
    setKeyEditing(false);
    setKeyVisible(false);
    setMessage(null);
  };
  const save = async () => {
    if (!provider || !dirty || saving || missingCredential) return;
    const update: WebSearchSettingsUpdate = {
      provider: form.provider,
      maxResults: form.maxResults,
      timeout: form.timeout,
      useJinaReader: form.useJinaReader,
    };
    if (acceptsKey(provider) && (apiKey || (provider.credential === 'optional_api_key' && keyEditing))) update.apiKey = apiKey;
    if (provider.credential === 'base_url') update.baseUrl = baseUrl;
    setSaving(true);
    setMessage(null);
    try {
      const payload = await updateWebSearchSettings(update);
      onSettingsChange(payload);
      setForm(fromPayload(payload));
      setKeyEditing(false);
      setKeyVisible(false);
      setError(false);
      setMessage(payload.requires_restart || form.useJinaReader !== settings.web.fetch.use_jina_reader
        ? t('settings.status.savedRestartApply')
        : t('settings.status.upToDate'));
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : t('settings.status.loadError'));
    } finally { setSaving(false); }
  };

  return (
    <SettingsPage>
      {message ? <SettingsNotice colors={colors} error={error} message={message} /> : null}
      <SettingsSection colors={colors} title={t('settings.sections.webSearch')}>
        <SettingsRow colors={colors} title={t('settings.byok.webSearch.provider')} description={t('settings.byok.webSearch.providerHelp')}>
          <SettingsPicker colors={colors} onChange={selectProvider} options={settings.web_search.providers.map((row) => ({ value: row.name, label: row.label, description: credentialLabel(t, row) }))} title={t('settings.byok.webSearch.selectProvider')} value={form.provider} />
        </SettingsRow>
        <SettingsRow colors={colors} title={t('settings.byok.webSearch.credentials')} description={provider?.credential === 'none' ? t('settings.byok.webSearch.noCredentialHelp') : t('settings.byok.webSearch.apiKeyHelp')}>
          <StatusPill colors={colors} label={missingCredential ? t('settings.values.notConfigured') : hasExistingSecret ? t('settings.values.configured') : provider?.credential === 'none' || provider?.credential === 'optional_api_key' ? t('settings.byok.webSearch.noCredentialRequired') : t('settings.values.pending')} tone={missingCredential ? 'warning' : 'success'} />
        </SettingsRow>
        {acceptsKey(provider) ? (
          <SettingsRow colors={colors} title={t('settings.byok.apiKey')} description={t('settings.byok.webSearch.apiKeyHelp')}>
            {hasExistingSecret && !keyEditing ? (
              <View style={styles.secretHint}><Text numberOfLines={1} style={[styles.secretText, { color: colors.muted }]}>{settings.web_search.api_key_hint ?? t('settings.byok.configuredKeyHint')}</Text><Pressable accessibilityLabel={t('settings.actions.edit')} onPress={() => setKeyEditing(true)}><Pencil color={colors.muted} size={15} /></Pressable></View>
            ) : (
              <View style={styles.secretInput}><SettingsInput colors={colors} onChangeText={(apiKey) => setForm((current) => ({ ...current, apiKey }))} placeholder={hasExistingSecret ? t('settings.byok.apiKeyConfiguredPlaceholder') : t('settings.byok.apiKeyPlaceholder')} secureTextEntry={!keyVisible} value={form.apiKey ?? ''} /><Pressable accessibilityLabel={keyVisible ? t('settings.byok.hideApiKey') : t('settings.byok.showApiKey')} onPress={() => setKeyVisible((value) => !value)} style={styles.eye}>{keyVisible ? <EyeOff color={colors.muted} size={16} /> : <Eye color={colors.muted} size={16} />}</Pressable></View>
            )}
          </SettingsRow>
        ) : null}
        {provider?.credential === 'base_url' ? <SettingsRow colors={colors} last title={t('settings.byok.webSearch.baseUrl')} description={t('settings.byok.webSearch.baseUrlHelp')}><SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(value) => setForm((current) => ({ ...current, baseUrl: value }))} placeholder={t('settings.byok.webSearch.baseUrlPlaceholder')} value={form.baseUrl ?? ''} /></SettingsRow> : null}
      </SettingsSection>

      <SettingsSection colors={colors} title={t('settings.sections.webBehavior')}>
        <SettingsRow colors={colors} title={t('settings.rows.maxResults')} description={t('settings.help.maxResults')}><SettingsInput colors={colors} keyboardType="number-pad" onChangeText={(value) => setForm((current) => ({ ...current, maxResults: Math.max(1, Math.min(10, Number(value) || 1)) }))} value={String(form.maxResults ?? settings.web_search.max_results)} /></SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.timeout')} description={t('settings.help.timeout')}><SettingsInput colors={colors} keyboardType="number-pad" onChangeText={(value) => setForm((current) => ({ ...current, timeout: Math.max(1, Math.min(120, Number(value) || 1)) }))} value={String(form.timeout ?? settings.web_search.timeout)} /></SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.jinaReader')} description={t('settings.help.jinaReader')}><SettingsSwitch colors={colors} onValueChange={(useJinaReader) => setForm((current) => ({ ...current, useJinaReader }))} value={form.useJinaReader ?? settings.web.fetch.use_jina_reader} /></SettingsRow>
        <SettingsRow colors={colors} last title={t('settings.byok.webSearch.saveHint')}><View style={styles.actions}><SettingsButton colors={colors} disabled={!dirty || saving || missingCredential} label={saving ? t('settings.actions.saving') : t('settings.actions.save')} onPress={() => void save()} primary /><SettingsButton colors={colors} disabled={!dirty || saving} label={t('settings.actions.cancel')} onPress={reset} />{settings.requires_restart ? <SettingsButton colors={colors} disabled={!runtimePolicy.canRestart} label={runtimePolicy.canRestart ? t('app.system.restart') : runtimePolicy.restartLabel} onPress={onRestart} /> : null}</View></SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}

function credentialLabel(t: TFunction, provider: WebSearchProviderInfo): string {
  if (provider.credential === 'none' || provider.credential === 'optional_api_key') return t('settings.byok.webSearch.noCredentialRequired');
  if (provider.credential === 'base_url') return t('settings.byok.webSearch.baseUrlRequired');
  return t('settings.byok.webSearch.apiKeyRequired');
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7 },
  secretHint: { minWidth: 150, minHeight: 39, paddingHorizontal: 11, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  secretText: { flex: 1, fontSize: 12 },
  secretInput: { width: 200, position: 'relative' },
  eye: { position: 'absolute', right: 10, top: 12 },
});
