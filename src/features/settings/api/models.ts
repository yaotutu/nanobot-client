import { apiClient } from '@/services/api/api';
import type {
  ModelConfigurationCreate,
  ModelConfigurationUpdate,
  ProviderModelsPayload,
} from '@/types/api/settings/models';
import type { SettingsPayload } from '@/types/api/settings/payload';

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
  if (configuration.contextWindowTokens !== undefined) {
    query.context_window_tokens = String(configuration.contextWindowTokens);
  }
  if (configuration.temperature !== undefined) {
    query.temperature = String(configuration.temperature);
  }
  if (configuration.reasoningEffort !== undefined) {
    query.reasoning_effort = configuration.reasoningEffort ?? '';
  }
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
  if (configuration.contextWindowTokens !== undefined) {
    query.context_window_tokens = String(configuration.contextWindowTokens);
  }
  if (configuration.temperature !== undefined) {
    query.temperature = String(configuration.temperature);
  }
  if (configuration.reasoningEffort !== undefined) {
    query.reasoning_effort = configuration.reasoningEffort ?? '';
  }
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
