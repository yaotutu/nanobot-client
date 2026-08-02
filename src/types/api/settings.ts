import type { RuntimeCapabilities, RuntimeSurface } from './runtime';
import type { WebuiDefaultAccessMode } from './workspaces';

export type RestartBehavior =
  "none" | "nextTurn" | "engineRestart" | "appRestart";
export type SettingsApplyStatus =
  | "idle"
  | "pending"
  | "applying"
  | "restarting_engine"
  | "requires_app_restart";

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
  status:
    | "available"
    | "unsupported"
    | "not_configured"
    | "missing_api_base"
    | "error";
  catalog_kind:
    "builtin" | "official" | "catalog" | "local" | "custom" | "unsupported";
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

export type ProviderAdvancedField =
  | "api_type"
  | "extra_headers"
  | "extra_body"
  | "extra_query"
  | "proxy"
  | "thinking_style"
  | "region"
  | "profile";

export interface ProviderSettingsInfo {
  name: string;
  label: string;
  is_custom?: boolean;
  configured: boolean;
  auth_type?: "api_key" | "oauth";
  api_key_required?: boolean;
  api_key_hint?: string | null;
  api_base?: string | null;
  default_api_base?: string | null;
  model_selectable?: boolean;
  model_catalog?: ProviderModelsPayload["catalog_kind"];
  api_type?: "auto" | "chat_completions" | "responses";
  oauth_account?: string | null;
  oauth_expires_at?: number | null;
  oauth_login_supported?: boolean;
  proxy?: string | null;
  advanced_fields?: ProviderAdvancedField[];
  extra_headers?: Record<string, string> | null;
  extra_body?: Record<string, unknown> | null;
  extra_query?: Record<string, string> | null;
  thinking_style?: string | null;
  region?: string | null;
  profile?: string | null;
}

export interface WebSearchProviderInfo {
  name: string;
  label: string;
  credential: "none" | "api_key" | "optional_api_key" | "base_url";
}

export interface ImageProviderInfo {
  name: string;
  label: string;
  configured: boolean;
  auth_type?: "api_key" | "oauth";
  api_key_hint?: string | null;
  api_base?: string | null;
  default_api_base?: string | null;
  models?: string[];
  default_model?: string | null;
}

export interface TranscriptionProviderInfo {
  name: string;
  label: string;
  configured: boolean;
  api_key_hint?: string | null;
  api_base?: string | null;
  default_api_base?: string | null;
}

export interface UsageDayInfo {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  provider_tokens?: number;
  estimated_tokens?: number;
  requests: number;
  provider_requests?: number;
  estimated_requests?: number;
  sources?: Record<
    string,
    {
      prompt_tokens: number;
      completion_tokens: number;
      cached_tokens: number;
      total_tokens: number;
      provider_tokens?: number;
      estimated_tokens?: number;
      requests: number;
      provider_requests?: number;
      estimated_requests?: number;
    }
  >;
}

export interface VersionCheckResult {
  updateAvailable: {
    currentVersion: string;
    latestVersion: string;
    pypiUrl?: string;
  } | null;
}

export interface SettingsPayload {
  surface?: RuntimeSurface;
  runtime_surface?: RuntimeSurface;
  runtime_capabilities?: RuntimeCapabilities;
  apply_state?: { status: SettingsApplyStatus; sections: string[] };
  restart_behavior_by_section?: Record<string, RestartBehavior>;
  agent: {
    model: string;
    provider: string;
    resolved_provider: string | null;
    has_api_key: boolean;
    model_preset: string | null;
    max_tokens: number;
    context_window_tokens: number;
    temperature: number;
    reasoning_effort: string | null;
    timezone: string;
    bot_name: string;
    bot_icon: string;
    tool_hint_max_length: number;
  };
  model_presets: ModelPresetInfo[];
  model_call_order: string[];
  model_call_order_editable: boolean;
  created_model_preset?: string;
  created_provider?: string;
  providers: ProviderSettingsInfo[];
  web_search: {
    provider: string;
    api_key_hint?: string | null;
    base_url?: string | null;
    max_results: number;
    timeout: number;
    providers: WebSearchProviderInfo[];
  };
  web: {
    enable: boolean;
    proxy?: string | null;
    user_agent?: string | null;
    search: { max_results: number; timeout: number };
    fetch: { use_jina_reader: boolean };
  };
  api?: {
    host: string;
    port: number;
    timeout: number;
    api_key_hint?: string | null;
  };
  observability?: {
    provider: "langfuse" | string;
    configured: boolean;
    base_url: string;
  };
  image_generation: {
    enabled: boolean;
    provider: string;
    provider_configured: boolean;
    model: string;
    default_aspect_ratio: string;
    default_image_size: string;
    max_images_per_turn: number;
    save_dir: string;
    providers: ImageProviderInfo[];
  };
  transcription?: {
    enabled: boolean;
    provider: string;
    provider_configured: boolean;
    model: string;
    language: string | null;
    max_duration_sec: number;
    max_upload_mb: number;
    providers: TranscriptionProviderInfo[];
  };
  runtime: {
    config_path: string;
    workspace_path: string;
    gateway_host: string;
    gateway_port: number;
    heartbeat: {
      enabled: boolean;
      interval_s: number;
      keep_recent_messages: number;
    };
    dream: { schedule: string };
    unified_session: boolean;
  };
  usage?: {
    days: UsageDayInfo[];
    total_tokens: number;
    total_tokens_30d: number;
    total_tokens_365d: number;
    peak_day_tokens: number;
    current_streak_days: number;
    longest_streak_days: number;
    active_days_30d: number;
    requests_30d: number;
    updated_at?: string | null;
  };
  advanced: {
    restrict_to_workspace: boolean;
    workspace_sandbox?: {
      restrict_to_workspace: boolean;
      workspace_root: string;
      level: "off" | "application" | "system" | string;
      enforced: boolean;
      provider: string;
      provider_label: string;
      summary: string;
    };
    ssrf_whitelist_count: number;
    webui_allow_local_service_access: boolean;
    allow_local_preview_access?: boolean;
    webui_default_access_mode: WebuiDefaultAccessMode;
    private_service_protection_enabled: boolean;
    mcp_server_count: number;
    exec_enabled: boolean;
    exec_sandbox?: string | null;
    exec_path_prepend_set: boolean;
    exec_path_append_set: boolean;
  };
  requires_restart: boolean;
  restart_required_sections?: Array<"runtime" | "browser" | "image">;
  version?: { current: string };
  docs?: {
    version: string;
    base_url: string;
    chat_apps_url: string;
    latest_url?: string;
  };
}

export interface ProviderOAuthAuthorizationRequired {
  status: "authorization_required";
  provider: string;
  flow_id: string;
  authorization_url: string;
  expires_in: number;
}

export interface ProviderOAuthPending {
  status: "pending";
  provider: string;
  flow_id: string;
}

export type ProviderOAuthLoginResult =
  SettingsPayload | ProviderOAuthAuthorizationRequired;
export type ProviderOAuthCompletionResult =
  SettingsPayload | ProviderOAuthPending;

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

export interface ProviderSettingsUpdate {
  provider: string;
  displayName?: string;
  apiKey?: string;
  apiBase?: string;
  apiType?: "auto" | "chat_completions" | "responses";
  proxy?: string;
  extraHeaders?: string;
  extraBody?: string;
  extraQuery?: string;
  thinkingStyle?: string;
  region?: string;
  profile?: string;
}

export interface ProviderCreationUpdate {
  name: string;
  apiKey?: string;
  apiBase: string;
  proxy?: string;
  extraHeaders?: string;
  extraBody?: string;
  extraQuery?: string;
  thinkingStyle?: string;
}

export interface WebSearchSettingsUpdate {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  maxResults?: number;
  timeout?: number;
  useJinaReader?: boolean;
}

export interface ImageGenerationSettingsUpdate {
  enabled: boolean;
  provider: string;
  model: string;
  defaultAspectRatio: string;
  defaultImageSize: string;
  maxImagesPerTurn: number;
}

export interface TranscriptionSettingsUpdate {
  enabled: boolean;
  provider: string;
  model: string;
  language: string;
  maxDurationSec: number;
  maxUploadMb: number;
}

export interface ApiServicePayload {
  installed: boolean;
  running: boolean;
  managed: boolean;
  host: string;
  port: number;
  timeout: number;
  api_key_hint?: string | null;
  endpoint: string;
  command: string;
  log_path?: string | null;
  last_action?: "started" | "stopped" | string;
}

export interface SettingsUpdate {
  modelPreset?: string | null;
  model?: string;
  provider?: string;
  contextWindowTokens?: number;
  timezone?: string;
  botName?: string;
  botIcon?: string;
  toolHintMaxLength?: number;
}

export interface NetworkSafetySettingsUpdate {
  webuiAllowLocalServiceAccess: boolean;
  webuiDefaultAccessMode: WebuiDefaultAccessMode;
}
