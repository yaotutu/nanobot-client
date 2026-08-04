import type { RuntimeCapabilities, RuntimeSurface } from '../runtime';
import type { WebuiDefaultAccessMode } from '../workspaces';
import type { ImageProviderInfo, TranscriptionProviderInfo, WebSearchProviderInfo } from './media';
import type { ModelPresetInfo } from './models';
import type { ProviderSettingsInfo } from './providers';
import type { RestartBehavior, SettingsApplyStatus } from './runtime';
import type { UsageDayInfo } from './usage';

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
    provider: 'langfuse' | string;
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
      level: 'off' | 'application' | 'system' | string;
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
  restart_required_sections?: Array<'runtime' | 'browser' | 'image'>;
  version?: { current: string };
  docs?: {
    version: string;
    base_url: string;
    chat_apps_url: string;
    latest_url?: string;
  };
}
