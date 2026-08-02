import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type {
  ModelPresetInfo,
  ProviderAdvancedField,
  ProviderOAuthAuthorizationRequired,
  ProviderOAuthPending,
  ProviderSettingsInfo,
  SettingsPayload,
} from '@/types/api/settings';

import type { SettingsPalette } from '@/features/settings/types';

export interface ModelsSettingsProps {
  colors: SettingsPalette;
  settings: SettingsPayload;
  showBrandLogos: boolean;
  onSettingsChange: (settings: SettingsPayload) => void;
  onRestart: () => void;
  runtimePolicy: RuntimeClientPolicy;
}

export interface ModelDraft {
  name: string;
  label: string;
  provider: string;
  model: string;
  maxTokens: string;
  contextWindowTokens: string;
  temperature: string;
  reasoningEffort: string;
}

export type ProviderApiType = 'auto' | 'chat_completions' | 'responses';

export interface ProviderForm {
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

export interface CustomProviderDraft extends ProviderForm {
  name: string;
}

export const CONTEXT_WINDOW_OPTIONS = [65_536, 200_000, 262_144, 500_000, 1_048_576];
export const CUSTOM_PROVIDER_FIELDS: ProviderAdvancedField[] = [
  'proxy',
  'extra_headers',
  'extra_body',
  'extra_query',
  'thinking_style',
];
export const CUSTOM_PROVIDER_KEY = '__custom_provider__';

export function presetDraft(preset: ModelPresetInfo): ModelDraft {
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

export function newPresetDraft(settings: SettingsPayload): ModelDraft {
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

export function providerJson(value: Record<string, unknown> | null | undefined): string {
  return value && Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : '';
}

export function providerForm(provider: ProviderSettingsInfo): ProviderForm {
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

export function emptyCustomProvider(): CustomProviderDraft {
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

export function isAuthorizationRequired(
  payload: SettingsPayload | ProviderOAuthAuthorizationRequired,
): payload is ProviderOAuthAuthorizationRequired {
  return (payload as ProviderOAuthAuthorizationRequired).status === 'authorization_required';
}

export function isOAuthPending(
  payload: SettingsPayload | ProviderOAuthPending,
): payload is ProviderOAuthPending {
  return (payload as ProviderOAuthPending).status === 'pending';
}

export function providerIsConfigured(
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

export function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseTemperature(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : null;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}
