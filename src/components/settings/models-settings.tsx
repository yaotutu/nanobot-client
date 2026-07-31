import * as Linking from 'expo-linking';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  KeyRound,
  ListOrdered,
  LogIn,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  completeProviderOAuth,
  createModelConfiguration,
  createProviderSettings,
  deleteModelConfiguration,
  fetchProviderModels,
  loginProviderOAuth,
  logoutProviderOAuth,
  migrateModelConfigurations,
  updateModelCallOrder,
  updateModelConfiguration,
  updateProviderSettings,
} from '@/lib/api';
import { DEFAULT_SERVER_URL } from '@/lib/config';
import type { RuntimeClientPolicy } from '@/lib/runtime-capabilities';
import type {
  ModelPresetInfo,
  ProviderAdvancedField,
  ProviderModelsPayload,
  ProviderOAuthAuthorizationRequired,
  ProviderOAuthPending,
  ProviderSettingsInfo,
  ProviderSettingsUpdate,
  SettingsPayload,
} from '@/types/nanobot';

import type { SettingsPalette } from '../settings-screen';
import {
  SegmentedControl,
  SettingsButton,
  SettingsInput,
  SettingsNotice,
  SettingsPage,
  SettingsPicker,
  SettingsSection,
  StatusPill,
} from './settings-controls';

interface ModelsSettingsProps {
  colors: SettingsPalette;
  token: string;
  settings: SettingsPayload;
  showBrandLogos: boolean;
  onSettingsChange: (settings: SettingsPayload) => void;
  onRestart: () => void;
  runtimePolicy: RuntimeClientPolicy;
}

interface ModelDraft {
  name: string;
  label: string;
  provider: string;
  model: string;
  maxTokens: string;
  contextWindowTokens: string;
  temperature: string;
  reasoningEffort: string;
}

type ProviderApiType = 'auto' | 'chat_completions' | 'responses';

interface ProviderForm {
  displayName: string;
  apiKey: string;
  apiBase: string;
  apiType: ProviderApiType;
  proxy: string;
  extraHeaders: string;
  extraBody: string;
  extraQuery: string;
  thinkingStyle: string;
  region: string;
  profile: string;
}

interface CustomProviderDraft extends ProviderForm {
  name: string;
}

const CONTEXT_WINDOW_OPTIONS = [65_536, 200_000, 262_144, 500_000, 1_048_576];
const CUSTOM_PROVIDER_FIELDS: ProviderAdvancedField[] = [
  'proxy',
  'extra_headers',
  'extra_body',
  'extra_query',
  'thinking_style',
];
const CUSTOM_PROVIDER_KEY = '__custom_provider__';

function presetDraft(preset: ModelPresetInfo): ModelDraft {
  return {
    name: preset.name,
    label: preset.label,
    provider: preset.provider,
    model: preset.model,
    maxTokens: String(preset.max_tokens),
    contextWindowTokens: String(preset.context_window_tokens || 200_000),
    temperature: String(preset.temperature),
    reasoningEffort: preset.reasoning_effort ?? '',
  };
}

function newPresetDraft(settings: SettingsPayload): ModelDraft {
  const primary = settings.model_presets.find(
    (preset) => !preset.is_default && preset.name === settings.model_call_order[0],
  );
  const currentProvider = primary?.provider === 'auto'
    ? primary.resolved_provider ?? settings.agent.resolved_provider
    : primary?.provider ?? settings.agent.provider;
  const provider = settings.providers.find(
    (item) => item.configured && item.model_selectable !== false && item.name === currentProvider,
  )?.name ?? settings.providers.find(
    (item) => item.configured && item.model_selectable !== false,
  )?.name ?? '';
  return {
    name: '',
    label: '',
    provider,
    model: '',
    maxTokens: String(primary?.max_tokens ?? settings.agent.max_tokens ?? 8192),
    contextWindowTokens: String(primary?.context_window_tokens ?? settings.agent.context_window_tokens ?? 200_000),
    temperature: String(primary?.temperature ?? settings.agent.temperature ?? 0.7),
    reasoningEffort: primary?.reasoning_effort ?? settings.agent.reasoning_effort ?? '',
  };
}

function providerJson(value: Record<string, unknown> | null | undefined): string {
  return value && Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : '';
}

function providerForm(provider: ProviderSettingsInfo): ProviderForm {
  return {
    displayName: provider.is_custom ? provider.label : '',
    apiKey: '',
    apiBase: provider.api_base ?? provider.default_api_base ?? '',
    apiType: provider.api_type ?? 'auto',
    proxy: provider.proxy ?? '',
    extraHeaders: providerJson(provider.extra_headers),
    extraBody: providerJson(provider.extra_body),
    extraQuery: providerJson(provider.extra_query),
    thinkingStyle: provider.thinking_style ?? '',
    region: provider.region ?? '',
    profile: provider.profile ?? '',
  };
}

function emptyCustomProvider(): CustomProviderDraft {
  return {
    name: '',
    displayName: '',
    apiKey: '',
    apiBase: '',
    apiType: 'auto',
    proxy: '',
    extraHeaders: '',
    extraBody: '',
    extraQuery: '',
    thinkingStyle: '',
    region: '',
    profile: '',
  };
}

function isAuthorizationRequired(
  payload: SettingsPayload | ProviderOAuthAuthorizationRequired,
): payload is ProviderOAuthAuthorizationRequired {
  return (payload as ProviderOAuthAuthorizationRequired).status === 'authorization_required';
}

function isOAuthPending(
  payload: SettingsPayload | ProviderOAuthPending,
): payload is ProviderOAuthPending {
  return (payload as ProviderOAuthPending).status === 'pending';
}

function providerIsConfigured(
  settings: SettingsPayload,
  providerName: string,
  resolvedProvider?: string | null,
): boolean {
  const row = settings.providers.find((provider) => provider.name === providerName);
  if (row) return row.configured;
  if (providerName === 'auto') {
    const resolved = settings.providers.find(
      (provider) => provider.name === (resolvedProvider ?? settings.agent.resolved_provider),
    );
    if (resolved) return resolved.configured;
  }
  return settings.agent.has_api_key;
}

function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseTemperature(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : null;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function ProviderMark({ colors, label, showBrandLogos }: {
  colors: SettingsPalette;
  label: string;
  showBrandLogos: boolean;
}) {
  return (
    <View style={[styles.providerMark, { backgroundColor: colors.pressed }]}>
      {showBrandLogos ? (
        <Text style={[styles.providerInitial, { color: colors.foreground }]}>{label.slice(0, 2).toUpperCase()}</Text>
      ) : (
        <Bot color={colors.muted} size={15} />
      )}
    </View>
  );
}

function IconButton({ colors, label, disabled = false, onPress, children }: {
  colors: SettingsPalette;
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: colors.background, borderColor: colors.border },
        { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

function FieldLabel({ colors, children }: { colors: SettingsPalette; children: React.ReactNode }) {
  return <Text style={[styles.fieldLabel, { color: colors.muted }]}>{children}</Text>;
}

function ModelCatalog({ colors, token, settings, provider, value, onChange }: {
  colors: SettingsPalette;
  token: string;
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
      setPayload(await fetchProviderModels(DEFAULT_SERVER_URL, token, effectiveProvider));
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

function AdvancedProviderFields({ colors, fields, form, onChange }: {
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

function ProviderCatalog({ colors, provider, token }: {
  colors: SettingsPalette;
  provider: ProviderSettingsInfo;
  token: string;
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
      setPayload(await fetchProviderModels(DEFAULT_SERVER_URL, token, provider.name));
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

function PresetsSection({ colors, token, settings, showBrandLogos, onSettingsChange }: ModelsSettingsProps) {
  const { t } = useTranslation();
  const namedPresets = settings.model_presets.filter((preset) => !preset.is_default);
  const initialPreset = namedPresets.find((preset) => preset.name === settings.model_call_order[0]) ?? namedPresets[0] ?? null;
  const [selectedName, setSelectedName] = useState(initialPreset?.name ?? '');
  const [draft, setDraft] = useState<ModelDraft | null>(initialPreset ? presetDraft(initialPreset) : null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedPreset = namedPresets.find((preset) => preset.name === selectedName) ?? null;
  const callOrder = settings.model_call_order;
  const orderedNames = new Set(callOrder);
  const visibleRows = [
    ...callOrder.map((name, index) => ({ name, index, preset: namedPresets.find((preset) => preset.name === name) })),
    ...namedPresets.filter((preset) => !orderedNames.has(preset.name)).map((preset) => ({ name: preset.name, index: -1, preset })),
  ];

  const providerOptions = useMemo(() => {
    const rows = settings.providers.filter((provider) => provider.configured && provider.model_selectable !== false);
    const selectedProvider = settings.providers.find((provider) => provider.name === draft?.provider);
    if (selectedProvider && !rows.some((provider) => provider.name === selectedProvider.name)) rows.push(selectedProvider);
    const result = rows.map((provider) => ({ value: provider.name, label: provider.label, description: provider.configured ? t('settings.values.configured') : t('settings.values.notConfigured') }));
    if (draft?.provider === 'auto') result.unshift({ value: 'auto', label: 'Auto', description: t('settings.models.autoProviderCustomOnly') });
    return result;
  }, [draft?.provider, settings.providers, t]);

  const applyOrder = async (nextOrder: string[]) => {
    if (busy || nextOrder.length === 0) return;
    setBusy('order');
    setError(null);
    try {
      onSettingsChange(await updateModelCallOrder(DEFAULT_SERVER_URL, token, nextOrder));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.models.callOrderUpdateFailed', { defaultValue: 'Could not update model call order.' }));
    } finally {
      setBusy(null);
    }
  };

  const openPreset = (preset: ModelPresetInfo) => {
    if (selectedName === preset.name && editorOpen && !creating) {
      setEditorOpen(false);
      return;
    }
    setSelectedName(preset.name);
    setDraft(presetDraft(preset));
    setCreating(false);
    setAdvancedOpen(false);
    setEditorOpen(true);
  };

  const beginCreate = () => {
    setSelectedName('');
    setDraft(newPresetDraft(settings));
    setCreating(true);
    setAdvancedOpen(false);
    setEditorOpen(true);
  };

  const cancelEdit = () => {
    setCreating(false);
    setAdvancedOpen(false);
    setEditorOpen(false);
    setDraft(selectedPreset ? presetDraft(selectedPreset) : null);
  };

  const savePreset = async () => {
    if (!draft || busy) return;
    const maxTokens = parsePositiveInteger(draft.maxTokens);
    const contextWindowTokens = parsePositiveInteger(draft.contextWindowTokens);
    const temperature = parseTemperature(draft.temperature);
    if (!draft.label.trim() || !draft.provider.trim() || !draft.model.trim()) {
      setError(t('settings.models.presetFieldsRequired', { defaultValue: 'Preset name, provider, and model are required.' }));
      return;
    }
    if (maxTokens === null || contextWindowTokens === null || temperature === null) {
      setError(t('settings.models.invalidGenerationSettings', { defaultValue: 'Token values must be positive integers and temperature must be between 0 and 2.' }));
      return;
    }
    if (!providerIsConfigured(settings, draft.provider, selectedPreset?.resolved_provider)) {
      setError(t('settings.models.configureProviderBeforeSaving'));
      return;
    }
    setBusy('preset');
    setError(null);
    try {
      if (creating) {
        const created = await createModelConfiguration(DEFAULT_SERVER_URL, token, {
          label: draft.label.trim(),
          provider: draft.provider,
          model: draft.model.trim(),
          maxTokens,
          contextWindowTokens,
          temperature,
          reasoningEffort: draft.reasoningEffort.trim() || null,
        });
        const createdName = created.created_model_preset;
        if (createdName && !created.model_call_order.includes(createdName)) {
          onSettingsChange(await updateModelCallOrder(
            DEFAULT_SERVER_URL,
            token,
            [...created.model_call_order, createdName],
          ));
        } else {
          onSettingsChange(created);
        }
      } else if (selectedPreset) {
        onSettingsChange(await updateModelConfiguration(DEFAULT_SERVER_URL, token, {
          name: selectedPreset.name,
          label: draft.label.trim(),
          provider: draft.provider,
          model: draft.model.trim(),
          maxTokens,
          contextWindowTokens,
          temperature,
          reasoningEffort: draft.reasoningEffort.trim() || null,
        }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.models.saveFailed', { defaultValue: 'Could not save the model preset.' }));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () => {
    if (!selectedPreset || busy) return;
    if (callOrder.includes(selectedPreset.name)) {
      setError(t('settings.models.removeBeforeDelete'));
      return;
    }
    Alert.alert(t('settings.models.deletePresetTitle'), t('settings.models.deletePresetHelp', { name: selectedPreset.label }), [
      { text: t('settings.actions.cancel'), style: 'cancel' },
      {
        text: t('settings.actions.delete'),
        style: 'destructive',
        onPress: () => {
          setBusy('delete');
          setError(null);
          void deleteModelConfiguration(DEFAULT_SERVER_URL, token, selectedPreset.name)
            .then(onSettingsChange)
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('settings.models.deleteFailed', { defaultValue: 'Could not delete the preset.' })))
            .finally(() => setBusy(null));
        },
      },
    ]);
  };

  const migrate = async () => {
    if (busy) return;
    setBusy('migrate');
    setError(null);
    try {
      onSettingsChange(await migrateModelConfigurations(DEFAULT_SERVER_URL, token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.models.convertFailed', { defaultValue: 'Could not convert the model configuration.' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSection colors={colors} title={t('settings.models.presets')}>
      {!settings.model_call_order_editable ? (
        <View style={styles.migrateBox}>
          <View style={[styles.largeIcon, { backgroundColor: colors.pressed }]}><ListOrdered color={colors.muted} size={18} /></View>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('settings.models.convertTitle')}</Text>
            <Text style={[styles.rowDescription, { color: colors.subtle }]}>{t('settings.models.convertHelp')}</Text>
          </View>
          <SettingsButton colors={colors} disabled={busy !== null} label={busy === 'migrate' ? t('settings.models.converting') : t('settings.models.convertAction')} onPress={() => void migrate()} />
        </View>
      ) : (
        <>
          {visibleRows.map(({ name, index, preset }, rowIndex) => {
            const ordered = index >= 0;
            const active = index === 0;
            const selected = preset?.name === selectedName && editorOpen;
            return (
              <Pressable
                disabled={!preset || busy !== null}
                key={`${name}:${index}`}
                onPress={() => preset && openPreset(preset)}
                style={({ pressed }) => [
                  styles.presetRow,
                  rowIndex > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                  selected && { backgroundColor: colors.pressed },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <ProviderMark colors={colors} label={preset?.provider ?? '?'} showBrandLogos={showBrandLogos} />
                <View style={styles.rowCopy}>
                  <View style={styles.titleLine}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{preset?.label ?? name}</Text>
                    {active ? <StatusPill colors={colors} label={t('settings.models.primary')} tone="success" /> : null}
                    {!ordered ? <StatusPill colors={colors} label={t('settings.models.disabled')} /> : null}
                    {preset && !providerIsConfigured(settings, preset.provider, preset.resolved_provider) ? <StatusPill colors={colors} label={t('settings.values.notConfigured')} tone="warning" /> : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.rowDescription, { color: colors.subtle }]}>{preset ? `${preset.provider} · ${preset.model}` : t('settings.models.presetMissing', { defaultValue: 'Preset unavailable' })}</Text>
                </View>
                <View style={styles.rowActions}>
                  {ordered ? (
                    <>
                      <IconButton colors={colors} disabled={index === 0 || busy !== null} label={t('settings.models.moveUp')} onPress={() => {
                        const next = [...callOrder];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        void applyOrder(next);
                      }}><ArrowUp color={colors.muted} size={14} /></IconButton>
                      <IconButton colors={colors} disabled={index === callOrder.length - 1 || busy !== null} label={t('settings.models.moveDown')} onPress={() => {
                        const next = [...callOrder];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        void applyOrder(next);
                      }}><ArrowDown color={colors.muted} size={14} /></IconButton>
                      <IconButton colors={colors} disabled={callOrder.length <= 1 || busy !== null} label={t('settings.models.removeFromOrder')} onPress={() => void applyOrder(callOrder.filter((_, itemIndex) => itemIndex !== index))}><X color={colors.muted} size={14} /></IconButton>
                    </>
                  ) : (
                    <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.models.addToOrder')} onPress={() => void applyOrder([...callOrder, name])} />
                  )}
                </View>
              </Pressable>
            );
          })}
          <View style={[styles.sectionFooter, { borderTopColor: colors.border }]}>
            <Text style={[styles.helpText, { color: colors.subtle }]}>{t('settings.models.callOrder')}</Text>
            <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.models.newPreset')} onPress={beginCreate} />
          </View>
        </>
      )}

      {editorOpen && draft ? (
        <View style={[styles.editor, { borderTopColor: colors.border, backgroundColor: colors.pressed }]}>
          <View style={styles.editorHeader}>
            <Text style={[styles.editorTitle, { color: colors.foreground }]}>{creating ? t('settings.models.newPreset') : t('settings.models.editPreset')}</Text>
            <Pressable accessibilityLabel={t('settings.actions.cancel')} onPress={cancelEdit}><X color={colors.muted} size={18} /></Pressable>
          </View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.models.presetName')}</FieldLabel>
            <SettingsInput autoFocus={creating} colors={colors} onChangeText={(label) => setDraft((current) => current ? { ...current, label } : current)} placeholder={t('settings.models.presetNamePlaceholder')} value={draft.label} />
          </View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.providers.title')}</FieldLabel>
            <SettingsPicker
              colors={colors}
              onChange={(provider) => setDraft((current) => current ? { ...current, provider, model: provider === current.provider ? current.model : '' } : current)}
              options={providerOptions}
              title={t('settings.providers.title')}
              value={providerOptions.some((option) => option.value === draft.provider) ? draft.provider : ''}
            />
          </View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.models.selectModel')}</FieldLabel>
            <ModelCatalog colors={colors} onChange={(model) => setDraft((current) => current ? { ...current, model } : current)} provider={draft.provider} settings={settings} token={token} value={draft.model} />
          </View>
          <Pressable onPress={() => setAdvancedOpen((value) => !value)} style={[styles.advancedHeader, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.rowCopy}>
              <Text style={[styles.advancedTitle, { color: colors.foreground }]}>{t('settings.providers.advancedOptions')}</Text>
              <Text style={[styles.helpText, { color: colors.subtle }]}>{t('settings.models.advancedSummary', { context: formatTokens(Number(draft.contextWindowTokens) || 0), max: formatTokens(Number(draft.maxTokens) || 0) })}</Text>
            </View>
            {advancedOpen ? <ChevronUp color={colors.muted} size={16} /> : <ChevronDown color={colors.muted} size={16} />}
          </Pressable>
          {advancedOpen ? (
            <View style={styles.advancedBody}>
              <View style={styles.twoColumns}>
                <View style={styles.columnField}><FieldLabel colors={colors}>{t('settings.models.maxTokens')}</FieldLabel><SettingsInput colors={colors} keyboardType="number-pad" onChangeText={(maxTokens) => setDraft((current) => current ? { ...current, maxTokens } : current)} value={draft.maxTokens} /></View>
                <View style={styles.columnField}><FieldLabel colors={colors}>{t('settings.models.temperature')}</FieldLabel><SettingsInput colors={colors} keyboardType="decimal-pad" onChangeText={(temperature) => setDraft((current) => current ? { ...current, temperature } : current)} value={draft.temperature} /></View>
              </View>
              <View style={styles.fieldStack}>
                <FieldLabel colors={colors}>{t('settings.models.contextWindow', { defaultValue: 'Context window' })}</FieldLabel>
                <SettingsPicker
                  colors={colors}
                  onChange={(contextWindowTokens) => setDraft((current) => current ? { ...current, contextWindowTokens } : current)}
                  options={Array.from(new Set([...CONTEXT_WINDOW_OPTIONS.map(String), draft.contextWindowTokens])).map((value) => ({ value, label: formatTokens(Number(value)) }))}
                  title={t('settings.models.contextWindow', { defaultValue: 'Context window' })}
                  value={draft.contextWindowTokens}
                />
              </View>
              <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.models.reasoningEffort')}</FieldLabel><SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(reasoningEffort) => setDraft((current) => current ? { ...current, reasoningEffort } : current)} placeholder={t('settings.values.default')} value={draft.reasoningEffort} /></View>
            </View>
          ) : null}
          {error ? <SettingsNotice colors={colors} error message={error} /> : null}
          <View style={styles.editorActions}>
            {!creating && selectedPreset ? <SettingsButton colors={colors} disabled={busy !== null || callOrder.includes(selectedPreset.name)} label={t('settings.actions.delete')} onPress={confirmDelete} /> : <View />}
            <View style={styles.actionGroup}>
              <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.actions.cancel')} onPress={cancelEdit} />
              <SettingsButton colors={colors} disabled={busy !== null} label={busy === 'preset' ? t('settings.actions.saving') : t('settings.actions.savePreset')} onPress={() => void savePreset()} primary />
            </View>
          </View>
        </View>
      ) : error ? <View style={styles.noticeWrap}><SettingsNotice colors={colors} error message={error} /></View> : null}
    </SettingsSection>
  );
}

function ProvidersSection({ colors, token, settings, showBrandLogos, onSettingsChange, onRestart, runtimePolicy }: ModelsSettingsProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, ProviderForm>>(() => Object.fromEntries(settings.providers.map((provider) => [provider.name, providerForm(provider)])));
  const [keyVisible, setKeyVisible] = useState<Record<string, boolean>>({});
  const [keyEditing, setKeyEditing] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomProviderDraft>(emptyCustomProvider);
  const [customKeyVisible, setCustomKeyVisible] = useState(false);
  const [oauthFlow, setOauthFlow] = useState<ProviderOAuthAuthorizationRequired | null>(null);
  const [oauthCode, setOauthCode] = useState('');
  const [oauthPending, setOauthPending] = useState(false);

  const configured = settings.providers.filter((provider) => provider.configured);
  const unconfigured = settings.providers.filter((provider) => !provider.configured && provider.name !== 'custom');

  const updateForm = (name: string, value: Partial<ProviderForm>) => {
    setForms((current) => ({ ...current, [name]: { ...(current[name] ?? providerForm(settings.providers.find((provider) => provider.name === name)!)), ...value } }));
  };

  const toggle = (provider: ProviderSettingsInfo) => {
    if (expanded === provider.name) {
      setExpanded(null);
    } else {
      setExpanded(provider.name);
      setForms((current) => ({ ...current, [provider.name]: providerForm(provider) }));
      setKeyEditing((current) => ({ ...current, [provider.name]: false }));
      setKeyVisible((current) => ({ ...current, [provider.name]: false }));
    }
    setCreatingCustom(false);
    setError(null);
  };

  const saveProvider = async (provider: ProviderSettingsInfo) => {
    if (busy) return;
    const form = forms[provider.name] ?? providerForm(provider);
    const oauth = provider.auth_type === 'oauth';
    const apiKey = form.apiKey.trim();
    if (!oauth && !provider.configured && (provider.api_key_required ?? true) && !apiKey) {
      setError(t('settings.byok.apiKeyRequired'));
      return;
    }
    const hasOptionalValue = Boolean(apiKey || form.apiBase.trim() || form.proxy.trim() || form.extraHeaders.trim() || form.extraBody.trim() || form.extraQuery.trim() || form.thinkingStyle.trim() || form.region.trim() || form.profile.trim());
    if (!oauth && !provider.configured && provider.api_key_required === false && !hasOptionalValue) {
      setError(t('settings.providers.configurationRequired', { defaultValue: 'Enter at least one provider setting.' }));
      return;
    }
    if (provider.is_custom && !form.displayName.trim()) {
      setError(t('settings.providers.customProviderNameRequired', { defaultValue: 'Provider name is required.' }));
      return;
    }
    setBusy(provider.name);
    setError(null);
    try {
      const update: ProviderSettingsUpdate = { provider: provider.name };
      if (!oauth) {
        update.apiKey = apiKey || undefined;
        update.apiBase = form.apiBase.trim();
        if (provider.is_custom) update.displayName = form.displayName.trim();
      }
      for (const field of provider.advanced_fields ?? []) {
        if (field === 'api_type') update.apiType = form.apiType;
        if (field === 'proxy') update.proxy = form.proxy.trim();
        if (field === 'extra_headers') update.extraHeaders = form.extraHeaders.trim();
        if (field === 'extra_body') update.extraBody = form.extraBody.trim();
        if (field === 'extra_query') update.extraQuery = form.extraQuery.trim();
        if (field === 'thinking_style') update.thinkingStyle = form.thinkingStyle.trim();
        if (field === 'region') update.region = form.region.trim();
        if (field === 'profile') update.profile = form.profile.trim();
      }
      onSettingsChange(await updateProviderSettings(DEFAULT_SERVER_URL, token, update));
      setForms((current) => ({ ...current, [provider.name]: { ...form, apiKey: '' } }));
      setKeyVisible((current) => ({ ...current, [provider.name]: false }));
      setKeyEditing((current) => ({ ...current, [provider.name]: false }));
      if (!oauth) setExpanded(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.providers.saveFailed', { defaultValue: 'Could not save the provider.' }));
    } finally {
      setBusy(null);
    }
  };

  const runOAuth = async (provider: ProviderSettingsInfo, action: 'login' | 'logout') => {
    if (busy) return;
    setBusy(provider.name);
    setError(null);
    try {
      const payload = action === 'login'
        ? await loginProviderOAuth(DEFAULT_SERVER_URL, token, provider.name)
        : await logoutProviderOAuth(DEFAULT_SERVER_URL, token, provider.name);
      if (isAuthorizationRequired(payload)) {
        setOauthFlow(payload);
        setOauthCode('');
        setOauthPending(false);
        setExpanded(provider.name);
        await Linking.openURL(payload.authorization_url);
      } else {
        onSettingsChange(payload);
        setOauthFlow(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.oauth.actionFailed', { defaultValue: 'OAuth action failed.' }));
    } finally {
      setBusy(null);
    }
  };

  const completeOAuth = async () => {
    if (!oauthFlow || !oauthCode.trim() || busy) return;
    setBusy(oauthFlow.provider);
    setError(null);
    try {
      const payload = await completeProviderOAuth(DEFAULT_SERVER_URL, token, oauthFlow.provider, oauthFlow.flow_id, oauthCode.trim());
      if (isOAuthPending(payload)) {
        setOauthPending(true);
      } else {
        onSettingsChange(payload);
        setOauthFlow(null);
        setOauthCode('');
        setOauthPending(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.oauth.finishFailed', { defaultValue: 'Could not finish OAuth authorization.' }));
    } finally {
      setBusy(null);
    }
  };

  const createCustom = async () => {
    if (busy || !customDraft.name.trim() || !customDraft.apiBase.trim()) return;
    setBusy(CUSTOM_PROVIDER_KEY);
    setError(null);
    try {
      onSettingsChange(await createProviderSettings(DEFAULT_SERVER_URL, token, {
        name: customDraft.name.trim(),
        apiKey: customDraft.apiKey.trim() || undefined,
        apiBase: customDraft.apiBase.trim(),
        proxy: customDraft.proxy.trim(),
        extraHeaders: customDraft.extraHeaders.trim(),
        extraBody: customDraft.extraBody.trim(),
        extraQuery: customDraft.extraQuery.trim(),
        thinkingStyle: customDraft.thinkingStyle.trim(),
      }));
      setCustomDraft(emptyCustomProvider());
      setCustomKeyVisible(false);
      setCreatingCustom(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.providers.createFailed', { defaultValue: 'Could not create the custom provider.' }));
    } finally {
      setBusy(null);
    }
  };

  const renderProvider = (provider: ProviderSettingsInfo, rowIndex: number) => {
    const open = expanded === provider.name;
    const form = forms[provider.name] ?? providerForm(provider);
    const oauth = provider.auth_type === 'oauth';
    const editingKey = !provider.configured || keyEditing[provider.name];
    return (
      <View key={provider.name} style={[rowIndex > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
        <Pressable onPress={() => toggle(provider)} style={({ pressed }) => [styles.providerRow, pressed && { opacity: 0.7 }]}>
          <ProviderMark colors={colors} label={provider.label} showBrandLogos={showBrandLogos} />
          <View style={styles.rowCopy}>
            <View style={styles.titleLine}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{provider.label}</Text>
              <StatusPill colors={colors} label={provider.configured ? t('settings.values.configured') : t('settings.values.notConfigured')} tone={provider.configured ? 'success' : 'neutral'} />
            </View>
            <Text numberOfLines={1} style={[styles.rowDescription, { color: colors.subtle }]}>{provider.api_base || provider.default_api_base || provider.name}</Text>
          </View>
          {open ? <ChevronUp color={colors.muted} size={17} /> : <ChevronDown color={colors.muted} size={17} />}
        </Pressable>
        {open ? (
          <View style={[styles.providerEditor, { backgroundColor: colors.pressed, borderTopColor: colors.border }]}>
            {oauth ? (
              <View style={[styles.oauthCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={styles.rowCopy}>
                  <Text style={[styles.smallTitle, { color: colors.foreground }]}>{provider.configured ? t('settings.oauth.signedIn') : t('settings.oauth.notSignedIn')}</Text>
                  <Text style={[styles.helpText, { color: colors.subtle }]}>{provider.oauth_account ?? (provider.configured ? t('settings.oauth.signedIn') : t('settings.oauth.signInBeforeSaving'))}</Text>
                </View>
                <SettingsButton
                  colors={colors}
                  disabled={busy !== null || (provider.configured ? false : !provider.oauth_login_supported)}
                  label={busy === provider.name ? t('settings.oauth.signingIn') : provider.configured ? t('settings.oauth.signOut') : t('settings.oauth.signIn')}
                  onPress={() => void runOAuth(provider, provider.configured ? 'logout' : 'login')}
                />
              </View>
            ) : (
              <>
                {provider.is_custom ? <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.providers.customProviderName')}</FieldLabel><SettingsInput colors={colors} onChangeText={(displayName) => updateForm(provider.name, { displayName })} value={form.displayName} /></View> : null}
                <View style={styles.fieldStack}>
                  <FieldLabel colors={colors}>{t('settings.byok.apiKey')}</FieldLabel>
                  {editingKey ? (
                    <View style={styles.inlineField}>
                      <SettingsInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        colors={colors}
                        onChangeText={(apiKey) => updateForm(provider.name, { apiKey })}
                        placeholder={provider.configured ? t('settings.byok.apiKeyConfiguredPlaceholder') : t('settings.byok.apiKeyPlaceholder')}
                        secureTextEntry={!keyVisible[provider.name]}
                        value={form.apiKey}
                      />
                      <IconButton colors={colors} label={keyVisible[provider.name] ? t('settings.byok.hideApiKey') : t('settings.byok.showApiKey')} onPress={() => setKeyVisible((current) => ({ ...current, [provider.name]: !current[provider.name] }))}>
                        {keyVisible[provider.name] ? <EyeOff color={colors.muted} size={15} /> : <Eye color={colors.muted} size={15} />}
                      </IconButton>
                      {provider.configured ? <IconButton colors={colors} label={t('settings.actions.cancel')} onPress={() => {
                        updateForm(provider.name, { apiKey: '' });
                        setKeyEditing((current) => ({ ...current, [provider.name]: false }));
                        setKeyVisible((current) => ({ ...current, [provider.name]: false }));
                      }}><X color={colors.muted} size={15} /></IconButton> : null}
                    </View>
                  ) : (
                    <View style={[styles.secretHint, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <KeyRound color={colors.muted} size={15} />
                      <Text style={[styles.secretText, { color: colors.muted }]}>{provider.api_key_hint ?? t('settings.byok.configuredKeyHint')}</Text>
                      <IconButton colors={colors} label={t('settings.actions.edit')} onPress={() => setKeyEditing((current) => ({ ...current, [provider.name]: true }))}><Pencil color={colors.muted} size={14} /></IconButton>
                    </View>
                  )}
                </View>
                <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.byok.apiBase')}</FieldLabel><SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(apiBase) => updateForm(provider.name, { apiBase })} placeholder={provider.default_api_base ?? 'https://api.example.com/v1'} value={form.apiBase} /></View>
              </>
            )}
            <AdvancedProviderFields colors={colors} fields={provider.advanced_fields ?? []} form={form} onChange={(value) => updateForm(provider.name, value)} />
            <ProviderCatalog colors={colors} provider={provider} token={token} />
            {error ? <SettingsNotice colors={colors} error message={error} /> : null}
            <View style={styles.editorActions}>
              <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.actions.cancel')} onPress={() => toggle(provider)} />
              {oauth ? (
                (provider.advanced_fields?.length ?? 0) > 0 ? <SettingsButton colors={colors} disabled={busy !== null} label={busy === provider.name ? t('settings.actions.saving') : t('settings.providers.saveProvider')} onPress={() => void saveProvider(provider)} primary /> : <View />
              ) : (
                <SettingsButton colors={colors} disabled={busy !== null} label={busy === provider.name ? t('settings.actions.saving') : t('settings.providers.saveProvider')} onPress={() => void saveProvider(provider)} primary />
              )}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const allRows = [...configured, ...unconfigured];
  return (
    <SettingsSection colors={colors} title={t('settings.providers.title')}>
      {settings.requires_restart ? (
        <View style={styles.restartRow}>
          <Text style={[styles.rowDescription, { color: colors.muted }]}>
            {runtimePolicy.canRestart
              ? t('settings.status.restartRequired', { defaultValue: 'Provider support changed. Restart the engine when convenient.' })
              : runtimePolicy.restartUnavailableReason}
          </Text>
          <SettingsButton
            colors={colors}
            disabled={!runtimePolicy.canRestart}
            label={runtimePolicy.canRestart ? t('app.system.restartEngine') : runtimePolicy.restartLabel}
            onPress={onRestart}
          />
        </View>
      ) : null}
      {allRows.map(renderProvider)}
      {creatingCustom ? (
        <View style={[styles.providerEditor, { backgroundColor: colors.pressed, borderTopColor: colors.border }]}>
          <View style={styles.editorHeader}><Text style={[styles.editorTitle, { color: colors.foreground }]}>{t('settings.providers.customProvider')}</Text><Pressable onPress={() => setCreatingCustom(false)}><X color={colors.muted} size={18} /></Pressable></View>
          <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.providers.customProviderName')}</FieldLabel><SettingsInput autoFocus colors={colors} onChangeText={(name) => setCustomDraft((current) => ({ ...current, name }))} placeholder="My model provider" value={customDraft.name} /></View>
          <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.byok.apiBase')}</FieldLabel><SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(apiBase) => setCustomDraft((current) => ({ ...current, apiBase }))} placeholder="https://api.example.com/v1" value={customDraft.apiBase} /></View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.byok.apiKey')}</FieldLabel>
            <View style={styles.inlineField}>
              <SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(apiKey) => setCustomDraft((current) => ({ ...current, apiKey }))} secureTextEntry={!customKeyVisible} value={customDraft.apiKey} />
              <IconButton colors={colors} label={customKeyVisible ? t('settings.byok.hideApiKey') : t('settings.byok.showApiKey')} onPress={() => setCustomKeyVisible((value) => !value)}>{customKeyVisible ? <EyeOff color={colors.muted} size={15} /> : <Eye color={colors.muted} size={15} />}</IconButton>
            </View>
          </View>
          <AdvancedProviderFields colors={colors} fields={CUSTOM_PROVIDER_FIELDS} form={customDraft} onChange={(value) => setCustomDraft((current) => ({ ...current, ...value }))} />
          {error ? <SettingsNotice colors={colors} error message={error} /> : null}
          <View style={styles.editorActions}><SettingsButton colors={colors} disabled={busy !== null} label={t('settings.actions.cancel')} onPress={() => setCreatingCustom(false)} /><SettingsButton colors={colors} disabled={busy !== null || !customDraft.name.trim() || !customDraft.apiBase.trim()} label={busy === CUSTOM_PROVIDER_KEY ? t('settings.actions.saving') : t('settings.providers.saveProvider')} onPress={() => void createCustom()} primary /></View>
        </View>
      ) : (
        <View style={[styles.sectionFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.helpText, { color: colors.subtle }]}>{t('settings.byok.configuredKeyHint')}</Text>
          <SettingsButton colors={colors} label={t('settings.providers.customProvider')} onPress={() => { setExpanded(null); setCustomDraft(emptyCustomProvider()); setCreatingCustom(true); setError(null); }} />
        </View>
      )}

      {oauthFlow ? (
        <Modal animationType="slide" onRequestClose={() => setOauthFlow(null)} transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.oauthSheet, { backgroundColor: colors.background }]}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t('settings.oauth.finishSignIn')}</Text>
              <Text style={[styles.rowDescription, { color: colors.subtle }]}>{t('settings.oauth.localCodeHelp')}</Text>
              <SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={setOauthCode} placeholder="Authorization code" secureTextEntry value={oauthCode} />
              {oauthPending ? <SettingsNotice colors={colors} message={t('settings.oauth.pending', { defaultValue: 'Authorization is still pending. Try again shortly.' })} /> : null}
              {error ? <SettingsNotice colors={colors} error message={error} /> : null}
              <View style={styles.editorActions}>
                <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.actions.cancel')} onPress={() => { setOauthFlow(null); setOauthCode(''); setOauthPending(false); }} />
                <View style={styles.actionGroup}>
                  <IconButton colors={colors} label={t('settings.actions.open')} onPress={() => void Linking.openURL(oauthFlow.authorization_url)}><LogIn color={colors.muted} size={15} /></IconButton>
                  <SettingsButton colors={colors} disabled={busy !== null || !oauthCode.trim()} label={busy ? t('settings.oauth.signingIn') : t('settings.oauth.finishSignIn')} onPress={() => void completeOAuth()} primary />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SettingsSection>
  );
}

export function ModelsSettings(props: ModelsSettingsProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage>
      <PresetsSection {...props} />
      <ProvidersSection {...props} />
      <View style={styles.legalNote}>
        <Text style={[styles.helpText, { color: props.colors.subtle }]}>{t('settings.legal.thirdPartyBrands')}</Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  advancedBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 13 },
  advancedHeader: { minHeight: 48, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  advancedPanel: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  advancedTitle: { fontSize: 13, fontWeight: '700' },
  catalogBox: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 9 },
  catalogHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catalogId: { fontSize: 10.5, lineHeight: 15 },
  catalogList: { gap: 4 },
  catalogModel: { fontSize: 12, fontWeight: '600' },
  catalogRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, gap: 2 },
  columnField: { flex: 1, minWidth: 0, gap: 6 },
  editor: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 13 },
  editorActions: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorTitle: { fontSize: 14, fontWeight: '800' },
  fieldLabel: { fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  fieldStack: { gap: 6 },
  helpText: { fontSize: 11.5, lineHeight: 17 },
  iconButton: { width: 36, height: 36, flexShrink: 0, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  inlineField: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  jsonInput: { minHeight: 86, textAlignVertical: 'top', fontFamily: 'monospace' },
  largeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  legalNote: { paddingHorizontal: 5 },
  migrateBox: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.36)' },
  noticeWrap: { padding: 12 },
  oauthCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  oauthSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28, gap: 14 },
  presetRow: { minHeight: 78, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  providerEditor: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 13 },
  providerInitial: { fontSize: 8.5, fontWeight: '800' },
  providerMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  providerRow: { minHeight: 70, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  restartRow: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowDescription: { fontSize: 11.5, lineHeight: 16 },
  rowTitle: { fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  secretHint: { minHeight: 42, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 11, paddingRight: 3, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secretText: { flex: 1, fontSize: 12 },
  sectionFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3 },
  sheetTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800' },
  smallTitle: { fontSize: 12.5, fontWeight: '700' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  twoColumns: { flexDirection: 'row', gap: 10 },
});
