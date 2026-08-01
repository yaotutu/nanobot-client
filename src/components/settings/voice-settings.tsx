import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { updateTranscriptionSettings } from '@/features/settings/api';
import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type { SettingsPayload, TranscriptionSettingsUpdate } from '@/types/api';

import type { SettingsPalette, SettingsSectionKey } from '../screens/settings-screen';
import { SettingsButton, SettingsInput, SettingsNotice, SettingsPage, SettingsPicker, SettingsRow, SettingsSection, SettingsSwitch, StatusPill } from './settings-controls';

const FALLBACK: NonNullable<SettingsPayload['transcription']> = {
  enabled: false,
  provider: '',
  provider_configured: false,
  model: '',
  language: null,
  max_duration_sec: 120,
  max_upload_mb: 25,
  providers: [],
};

function fromPayload(settings: SettingsPayload): TranscriptionSettingsUpdate {
  const voice = settings.transcription ?? FALLBACK;
  return { enabled: voice.enabled, provider: voice.provider, model: voice.model, language: voice.language ?? '', maxDurationSec: voice.max_duration_sec, maxUploadMb: voice.max_upload_mb };
}

export function VoiceSettings({ colors, settings, onSettingsChange, onSelectSection, onRestart, runtimePolicy }: {
  colors: SettingsPalette;
  settings: SettingsPayload;
  onSettingsChange: (settings: SettingsPayload) => void;
  onSelectSection: (section: SettingsSectionKey) => void;
  onRestart: () => void;
  runtimePolicy: RuntimeClientPolicy;
}) {
  const { t } = useTranslation();
  const voice = settings.transcription ?? FALLBACK;
  const [form, setForm] = useState(() => fromPayload(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const provider = voice.providers.find((row) => row.name === form.provider) ?? voice.providers[0];
  const configured = provider?.configured === true;
  const dirty = JSON.stringify(form) !== JSON.stringify(fromPayload(settings));
  const save = async () => {
    if (!dirty || saving || (form.enabled && !configured)) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = await updateTranscriptionSettings(form);
      onSettingsChange(payload);
      setForm(fromPayload(payload));
      setError(false);
      setMessage(payload.requires_restart ? t('settings.status.savedRestartApply') : t('settings.status.upToDate'));
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : t('settings.status.loadError'));
    } finally { setSaving(false); }
  };

  if (!settings.transcription) {
    return <SettingsPage><SettingsNotice colors={colors} message={t('settings.values.notAvailable')} /></SettingsPage>;
  }

  return (
    <SettingsPage>
      {message ? <SettingsNotice colors={colors} error={error} message={message} /> : null}
      <SettingsSection colors={colors} title={t('settings.sections.voiceInput')}>
        <SettingsRow colors={colors} title={t('settings.rows.transcription')} description={t('settings.help.transcription')}><SettingsSwitch colors={colors} onValueChange={(enabled) => setForm((current) => ({ ...current, enabled }))} value={form.enabled} /></SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.transcriptionProvider')} description={t('settings.help.transcriptionProvider')}><SettingsPicker colors={colors} onChange={(name) => setForm((current) => ({ ...current, provider: name }))} options={voice.providers.map((row) => ({ value: row.name, label: row.label, description: row.configured ? t('settings.values.configured') : t('settings.values.notConfigured') }))} title={t('settings.voice.selectProvider')} value={form.provider} /></SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.transcriptionProviderStatus')} description={t('settings.help.transcriptionProviderStatus')}><View style={styles.inline}><StatusPill colors={colors} label={configured ? t('settings.values.configured') : t('settings.values.notConfigured')} tone={configured ? 'success' : 'neutral'} />{!configured ? <SettingsButton colors={colors} label={t('settings.voice.configureProvider')} onPress={() => onSelectSection('models')} /> : null}</View></SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.transcriptionModel')} description={t('settings.help.transcriptionModel')}><SettingsInput colors={colors} onChangeText={(model) => setForm((current) => ({ ...current, model }))} value={form.model} /></SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.transcriptionLanguage')} description={t('settings.help.transcriptionLanguage')}><SettingsInput colors={colors} onChangeText={(language) => setForm((current) => ({ ...current, language }))} placeholder={t('settings.voice.languageAuto')} value={form.language} /></SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.voiceLimits')}>
          <View style={styles.inline}>
            <View style={styles.limitControl}>
              <SettingsInput colors={colors} keyboardType="number-pad" onChangeText={(value) => setForm((current) => ({ ...current, maxDurationSec: Math.max(1, Math.min(600, Number(value) || 1)) }))} value={String(form.maxDurationSec)} />
              <Text style={[styles.unit, { color: colors.muted }]}>s</Text>
            </View>
            <View style={styles.limitControl}>
              <SettingsInput colors={colors} keyboardType="number-pad" onChangeText={(value) => setForm((current) => ({ ...current, maxUploadMb: Math.max(1, Math.min(100, Number(value) || 1)) }))} value={String(form.maxUploadMb)} />
              <Text style={[styles.unit, { color: colors.muted }]}>MB</Text>
            </View>
          </View>
        </SettingsRow>
        <SettingsRow colors={colors} last title={t('settings.rows.pendingChanges')}><View style={styles.inline}><SettingsButton colors={colors} disabled={!dirty || saving || (form.enabled && !configured)} label={saving ? t('settings.actions.saving') : t('settings.actions.save')} onPress={() => void save()} primary />{settings.requires_restart ? <SettingsButton colors={colors} disabled={!runtimePolicy.canRestart} label={runtimePolicy.canRestart ? t('app.system.restart') : runtimePolicy.restartLabel} onPress={onRestart} /> : null}</View></SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7 },
  limitControl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unit: { fontSize: 11.5, fontWeight: '600' },
});
