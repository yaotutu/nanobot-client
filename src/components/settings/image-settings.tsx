import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { updateImageGenerationSettings } from '@/features/settings/api';
import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type { ImageGenerationSettingsUpdate, SettingsPayload } from '@/types/api';

import type { SettingsPalette, SettingsSectionKey } from '../screens/settings-screen';
import {
  SettingsButton,
  SettingsInput,
  SettingsNotice,
  SettingsPage,
  SettingsPicker,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
  StatusPill,
} from './settings-controls';

const ASPECTS = ['1:1', '3:4', '9:16', '4:3', '16:9', '3:2', '2:3', '21:9'];
const SIZES = ['1K', '2K', '4K', '1024x1024', '1536x1024', '1024x1536'];

function fromPayload(settings: SettingsPayload): ImageGenerationSettingsUpdate {
  const image = settings.image_generation;
  return {
    enabled: image.enabled,
    provider: image.provider,
    model: image.model,
    defaultAspectRatio: image.default_aspect_ratio,
    defaultImageSize: image.default_image_size,
    maxImagesPerTurn: image.max_images_per_turn,
  };
}

export function ImageSettings({ colors, settings, onSettingsChange, onSelectSection, onRestart, runtimePolicy }: {
  colors: SettingsPalette;
  settings: SettingsPayload;
  onSettingsChange: (settings: SettingsPayload) => void;
  onSelectSection: (section: SettingsSectionKey) => void;
  onRestart: () => void;
  runtimePolicy: RuntimeClientPolicy;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => fromPayload(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const selectedProvider = settings.image_generation.providers.find((row) => row.name === form.provider)
    ?? settings.image_generation.providers[0];
  const providerConfigured = selectedProvider?.configured === true;
  const dirty = JSON.stringify(form) !== JSON.stringify(fromPayload(settings));
  const providerOptions = settings.image_generation.providers.map((row) => ({
    value: row.name,
    label: row.label,
    description: row.configured ? t('settings.values.configured') : t('settings.values.notConfigured'),
  }));
  const modelOptions = useMemo(() => {
    const models = selectedProvider?.models ?? [];
    return Array.from(new Set([form.model, ...models].filter(Boolean))).map((value) => ({ value, label: value }));
  }, [form.model, selectedProvider?.models]);

  const selectProvider = (provider: string) => {
    const next = settings.image_generation.providers.find((row) => row.name === provider);
    setForm((current) => ({ ...current, provider, model: next?.default_model || next?.models?.[0] || current.model }));
  };
  const save = async () => {
    if (!dirty || saving || (form.enabled && !providerConfigured)) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = await updateImageGenerationSettings(form);
      onSettingsChange(payload);
      setForm(fromPayload(payload));
      setError(false);
      setMessage(payload.requires_restart ? t('settings.status.savedRestartApply') : t('settings.status.upToDate'));
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : t('settings.status.loadError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPage>
      {message ? <SettingsNotice colors={colors} error={error} message={message} /> : null}
      <SettingsSection colors={colors} title={t('settings.sections.imageGeneration')}>
        <SettingsRow colors={colors} title={t('settings.rows.imageGeneration')} description={t('settings.help.imageGeneration')}>
          <SettingsSwitch colors={colors} onValueChange={(enabled) => setForm((current) => ({ ...current, enabled }))} value={form.enabled} />
        </SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.imageProvider')} description={t('settings.help.imageProvider')}>
          <SettingsPicker colors={colors} onChange={selectProvider} options={providerOptions} title={t('settings.image.selectProvider')} value={form.provider} />
        </SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.imageProviderStatus')} description={t('settings.help.imageProviderStatus')}>
          <View style={styles.inline}><StatusPill colors={colors} label={providerConfigured ? t('settings.values.configured') : t('settings.values.notConfigured')} tone={providerConfigured ? 'success' : 'neutral'} />{!providerConfigured ? <SettingsButton colors={colors} label={t('settings.image.configureProvider')} onPress={() => onSelectSection('models')} /> : null}</View>
        </SettingsRow>
        <SettingsRow colors={colors} last title={t('settings.rows.imageProviderBase')}>
          <Text numberOfLines={2} selectable style={[styles.value, { color: colors.muted }]}>{selectedProvider?.api_base || selectedProvider?.default_api_base || selectedProvider?.name || t('settings.values.notAvailable')}</Text>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection colors={colors} title={t('settings.sections.imageDefaults')}>
        <SettingsRow colors={colors} title={t('settings.rows.imageModel')} description={t('settings.help.imageModel')}>
          {modelOptions.length > 1 ? <SettingsPicker colors={colors} onChange={(model) => setForm((current) => ({ ...current, model }))} options={modelOptions} title={t('settings.models.selectModel')} value={form.model} /> : <SettingsInput colors={colors} onChangeText={(model) => setForm((current) => ({ ...current, model }))} value={form.model} />}
        </SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.defaultAspectRatio')} description={t('settings.help.defaultAspectRatio')}>
          <SettingsPicker colors={colors} onChange={(defaultAspectRatio) => setForm((current) => ({ ...current, defaultAspectRatio }))} options={ASPECTS.map((value) => ({ value, label: value }))} title={t('settings.image.selectAspect')} value={form.defaultAspectRatio} />
        </SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.defaultImageSize')} description={t('settings.help.defaultImageSize')}>
          <SettingsPicker colors={colors} onChange={(defaultImageSize) => setForm((current) => ({ ...current, defaultImageSize }))} options={SIZES.map((value) => ({ value, label: value }))} title={t('settings.image.selectSize')} value={form.defaultImageSize} />
        </SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.maxImagesPerTurn')} description={t('settings.help.maxImagesPerTurn')}>
          <SettingsInput colors={colors} keyboardType="number-pad" onChangeText={(value) => setForm((current) => ({ ...current, maxImagesPerTurn: Math.max(1, Math.min(8, Number(value) || 1)) }))} value={String(form.maxImagesPerTurn)} />
        </SettingsRow>
        <SettingsRow colors={colors} title={t('settings.rows.imageSaveDir')}>
          <Text selectable style={[styles.value, { color: colors.muted }]}>{settings.image_generation.save_dir || t('settings.values.notAvailable')}</Text>
        </SettingsRow>
        <SettingsRow colors={colors} last title={t('settings.rows.pendingChanges')}>
          <View style={styles.inline}><SettingsButton colors={colors} disabled={!dirty || saving || (form.enabled && !providerConfigured)} label={saving ? t('settings.actions.saving') : t('settings.actions.save')} onPress={() => void save()} primary />{settings.requires_restart ? <SettingsButton colors={colors} disabled={!runtimePolicy.canRestart} label={runtimePolicy.canRestart ? t('app.system.restart') : runtimePolicy.restartLabel} onPress={onRestart} /> : null}</View>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({ inline: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7 }, value: { maxWidth: 220, textAlign: 'right', fontSize: 12, lineHeight: 17 } });
