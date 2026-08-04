export interface ProviderModelInfo {
  id: string;
  label?: string | null;
  description?: string | null;
  owned_by?: string | null;
  context_window?: number | null;
}

export interface ProviderModelsPayload {
  provider: string;
  label: string;
  status: 'available' | 'unsupported' | 'not_configured' | 'missing_api_base' | 'error';
  catalog_kind: 'builtin' | 'official' | 'catalog' | 'local' | 'custom' | 'unsupported';
  models: ProviderModelInfo[];
  model_count: number;
  message?: string | null;
  fetched_at?: number;
}

export interface ModelPresetInfo {
  name: string;
  label: string;
  active: boolean;
  is_default: boolean;
  model: string;
  provider: string;
  resolved_provider?: string | null;
  max_tokens: number;
  context_window_tokens: number;
  temperature: number;
  reasoning_effort: string | null;
  reasoning_effort_values?: string[];
}

export interface ModelConfigurationCreate {
  name?: string;
  label: string;
  provider: string;
  model: string;
  maxTokens?: number;
  contextWindowTokens?: number;
  temperature?: number;
  reasoningEffort?: string | null;
}

export interface ModelConfigurationUpdate {
  name: string;
  label?: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  contextWindowTokens?: number;
  temperature?: number;
  reasoningEffort?: string | null;
}
