import { apiClient } from '@/services/api/api';
import type {
  ApiServicePayload,
  ImageGenerationSettingsUpdate,
  ModelConfigurationCreate,
  ModelConfigurationUpdate,
  NetworkSafetySettingsUpdate,
  ProviderCreationUpdate,
  ProviderModelsPayload,
  ProviderOAuthCompletionResult,
  ProviderOAuthLoginResult,
  ProviderSettingsUpdate,
  SettingsPayload,
  SettingsUpdate,
  TranscriptionSettingsUpdate,
  VersionCheckResult,
  WebSearchSettingsUpdate,
} from '@/types/api/settings';

export async function fetchSettings(): Promise<SettingsPayload> {
  return apiClient.get<SettingsPayload>('/api/settings');
}

export async function fetchSettingsUsage(): Promise<NonNullable<SettingsPayload['usage']>> {
  return apiClient.get<NonNullable<SettingsPayload['usage']>>('/api/settings/usage');
}

export async function checkVersion(): Promise<VersionCheckResult> {
  return apiClient.request<VersionCheckResult>('/api/settings/version-check', {
    method: 'GET',
    timeoutMs: 10_000,
  });
}

export async function updateSettings(update: SettingsUpdate): Promise<SettingsPayload> {
  const query: Record<string, string> = {};
  if (update.modelPreset !== undefined) query.model_preset = update.modelPreset ?? 'default';
  if (update.model !== undefined) query.model = update.model;
  if (update.provider !== undefined) query.provider = update.provider;
  if (update.contextWindowTokens !== undefined) {
    query.context_window_tokens = String(update.contextWindowTokens);
  }
  if (update.timezone !== undefined) query.timezone = update.timezone;
  if (update.botName !== undefined) query.bot_name = update.botName;
  if (update.botIcon !== undefined) query.bot_icon = update.botIcon;
  if (update.toolHintMaxLength !== undefined) {
    query.tool_hint_max_length = String(update.toolHintMaxLength);
  }
  return apiClient.request<SettingsPayload>('/api/settings/update', { method: 'GET', query });
}

export async function createModelConfiguration(
  configuration: ModelConfigurationCreate,
): Promise<SettingsPayload> {
  const query: Record<string, string> = {
    label: configuration.label,
    provider: configuration.provider,
    model: configuration.model,
  };
  if (configuration.name !== undefined) query.name = configuration.name;
  if (configuration.maxTokens !== undefined) query.max_tokens = String(configuration.maxTokens);
  if (configuration.contextWindowTokens !== undefined) query.context_window_tokens = String(configuration.contextWindowTokens);
  if (configuration.temperature !== undefined) query.temperature = String(configuration.temperature);
  if (configuration.reasoningEffort !== undefined) query.reasoning_effort = configuration.reasoningEffort ?? '';
  return apiClient.request<SettingsPayload>(
    '/api/settings/model-configurations/create',
    { method: 'GET', query },
  );
}

export async function updateModelConfiguration(
  configuration: ModelConfigurationUpdate,
): Promise<SettingsPayload> {
  const query: Record<string, string> = { name: configuration.name };
  if (configuration.label !== undefined) query.label = configuration.label;
  if (configuration.provider !== undefined) query.provider = configuration.provider;
  if (configuration.model !== undefined) query.model = configuration.model;
  if (configuration.maxTokens !== undefined) query.max_tokens = String(configuration.maxTokens);
  if (configuration.contextWindowTokens !== undefined) query.context_window_tokens = String(configuration.contextWindowTokens);
  if (configuration.temperature !== undefined) query.temperature = String(configuration.temperature);
  if (configuration.reasoningEffort !== undefined) query.reasoning_effort = configuration.reasoningEffort ?? '';
  return apiClient.request<SettingsPayload>(
    '/api/settings/model-configurations/update',
    { method: 'GET', query },
  );
}

export async function deleteModelConfiguration(name: string): Promise<SettingsPayload> {
  return apiClient.request<SettingsPayload>(
    '/api/settings/model-configurations/delete',
    { method: 'GET', query: { name } },
  );
}

export async function migrateModelConfigurations(): Promise<SettingsPayload> {
  return apiClient.request<SettingsPayload>(
    '/api/settings/model-configurations/migrate',
    { method: 'GET' },
  );
}

export async function updateModelCallOrder(order: string[]): Promise<SettingsPayload> {
  return apiClient.request<SettingsPayload>(
    '/api/settings/model-call-order/update',
    { method: 'GET', query: { order: JSON.stringify(order) } },
  );
}

export async function fetchProviderModels(provider: string): Promise<ProviderModelsPayload> {
  return apiClient.get<ProviderModelsPayload>('/api/settings/provider-models', { provider });
}

export async function updateProviderSettings(update: ProviderSettingsUpdate): Promise<SettingsPayload> {
  const { provider, ...values } = update;
  return apiClient.request<SettingsPayload>(
    '/api/settings/provider/update',
    { method: 'GET', query: { provider }, headers: { 'X-Nanobot-Provider-Values': encodeURIComponent(JSON.stringify(values)) } },
  );
}

export async function createProviderSettings(update: ProviderCreationUpdate): Promise<SettingsPayload> {
  return apiClient.request<SettingsPayload>(
    '/api/settings/provider/create',
    { method: 'GET', headers: { 'X-Nanobot-Provider-Values': encodeURIComponent(JSON.stringify(update)) } },
  );
}

export async function loginProviderOAuth(provider: string): Promise<ProviderOAuthLoginResult> {
  return apiClient.request<ProviderOAuthLoginResult>(
    '/api/settings/provider/oauth-login',
    { method: 'GET', query: { provider } },
  );
}

export async function completeProviderOAuth(
  provider: string,
  flowId: string,
  authorizationCode?: string,
): Promise<ProviderOAuthCompletionResult> {
  const query: Record<string, string> = { provider, flow_id: flowId };
  const headers = authorizationCode ? { 'X-Nanobot-OAuth-Code': authorizationCode } : undefined;
  return apiClient.request<ProviderOAuthCompletionResult>(
    '/api/settings/provider/oauth-login/complete',
    { method: 'GET', query, headers },
  );
}

export async function logoutProviderOAuth(provider: string): Promise<SettingsPayload> {
  return apiClient.get<SettingsPayload>('/api/settings/provider/oauth-logout', { provider });
}

export async function updateWebSearchSettings(update: WebSearchSettingsUpdate): Promise<SettingsPayload> {
  const query: Record<string, string> = { provider: update.provider };
  if (update.apiKey !== undefined) query.api_key = update.apiKey;
  if (update.baseUrl !== undefined) query.base_url = update.baseUrl;
  if (update.maxResults !== undefined) query.max_results = String(update.maxResults);
  if (update.timeout !== undefined) query.timeout = String(update.timeout);
  if (update.useJinaReader !== undefined) query.use_jina_reader = String(update.useJinaReader);
  return apiClient.request<SettingsPayload>(
    '/api/settings/web-search/update',
    { method: 'GET', query },
  );
}

export async function updateImageGenerationSettings(
  update: ImageGenerationSettingsUpdate,
): Promise<SettingsPayload> {
  const query: Record<string, string> = {
    enabled: String(update.enabled),
    provider: update.provider,
    model: update.model,
    default_aspect_ratio: update.defaultAspectRatio,
    default_image_size: update.defaultImageSize,
    max_images_per_turn: String(update.maxImagesPerTurn),
  };
  return apiClient.request<SettingsPayload>(
    '/api/settings/image-generation/update',
    { method: 'GET', query },
  );
}

export async function updateTranscriptionSettings(
  update: TranscriptionSettingsUpdate,
): Promise<SettingsPayload> {
  const query: Record<string, string> = {
    enabled: String(update.enabled),
    provider: update.provider,
    model: update.model,
    language: update.language,
    max_duration_sec: String(update.maxDurationSec),
    max_upload_mb: String(update.maxUploadMb),
  };
  return apiClient.request<SettingsPayload>(
    '/api/settings/transcription/update',
    { method: 'GET', query },
  );
}

export async function fetchApiService(): Promise<ApiServicePayload> {
  return apiClient.get<ApiServicePayload>('/api/settings/api-service');
}

export async function startApiService(values: { host: string; port: number; timeout: number; apiKey?: string }): Promise<ApiServicePayload> {
  const query: Record<string, string> = {
    host: values.host,
    port: String(values.port),
    timeout: String(values.timeout),
  };
  const headers = values.apiKey !== undefined
    ? { 'X-Nanobot-API-Service-Values': JSON.stringify({ api_key: values.apiKey }) }
    : undefined;
  return apiClient.request<ApiServicePayload>(
    '/api/settings/api-service/start',
    { method: 'GET', query, headers },
  );
}

export async function stopApiService(): Promise<ApiServicePayload> {
  return apiClient.get<ApiServicePayload>('/api/settings/api-service/stop');
}

export async function updateNetworkSafetySettings(update: NetworkSafetySettingsUpdate): Promise<SettingsPayload> {
  return apiClient.request<SettingsPayload>(
    '/api/settings/network-safety/update',
    { method: 'GET', query: {
      webui_allow_local_service_access: String(update.webuiAllowLocalServiceAccess),
      webui_default_access_mode: update.webuiDefaultAccessMode,
    } },
  );
}
