export type ConnectionStatus =
  "idle" | "connecting" | "open" | "reconnecting" | "closed" | "error";

export type RuntimeSurface = "browser" | "native";

export interface RuntimeCapabilities {
  can_restart_engine: boolean;
  can_pick_folder: boolean;
  can_open_logs: boolean;
  can_export_diagnostics: boolean;
}

export interface WebUIIngressLimits {
  transport: {
    max_frame_bytes: number;
    envelope_reserve_bytes: number;
  };
  message: {
    max_text_bytes: number;
  };
  attachments: {
    max_count: number;
    max_file_bytes: number;
    max_total_bytes: number;
  };
}

export interface GoalStateWsPayload {
  active: boolean;
  ui_summary?: string;
  objective?: string;
}

export interface BootstrapResponse {
  token: string;
  api_token: string;
  ws_path: string;
  ws_url?: string | null;
  expires_in: number;
  limits?: WebUIIngressLimits;
  model_name?: string | null;
  runtime_surface?: RuntimeSurface;
  runtime_capabilities?: RuntimeCapabilities;
}

export type WorkspaceAccessMode = "restricted" | "full";

export interface WorkspaceSandboxStatus {
  restrict_to_workspace: boolean;
  workspace_root: string;
  level: string;
  enforced: boolean;
  provider: string;
  provider_label: string;
  summary: string;
}

export interface WorkspaceScopePayload {
  project_path: string;
  project_name?: string;
  access_mode: WorkspaceAccessMode;
  restrict_to_workspace?: boolean;
  sandbox_status?: WorkspaceSandboxStatus;
}

export interface WorkspacesPayload {
  schema_version: number;
  default_access_mode: WebuiDefaultAccessMode;
  default_scope: WorkspaceScopePayload;
  controls: {
    can_change_project: boolean;
    can_use_full_access: boolean;
  };
}

export interface ChatSummary {
  key: string;
  channel: string;
  chatId: string;
  createdAt: string | null;
  updatedAt: string | null;
  title?: string;
  preview: string;
  modelPreset?: string | null;
  runStartedAt?: number | null;
  workspaceScope?: WorkspaceScopePayload | null;
}

export type SidebarDensity = "comfortable" | "compact";
export type SidebarSortMode = "updated_desc" | "created_desc" | "title_asc";

export interface SidebarStatePayload {
  schema_version: number;
  pinned_keys: string[];
  archived_keys: string[];
  title_overrides: Record<string, string>;
  project_name_overrides: Record<string, string>;
  tags_by_key: Record<string, string[]>;
  collapsed_groups: Record<string, boolean>;
  view: {
    density: SidebarDensity;
    show_previews: boolean;
    show_timestamps: boolean;
    show_archived: boolean;
    sort: SidebarSortMode;
  };
  updated_at?: string | null;
}

export interface OutboundMedia {
  data_url: string;
  name?: string;
}

export interface UIImage {
  url?: string;
  name?: string;
}

export interface UIMediaAttachment {
  kind: "image" | "video" | "file";
  url?: string;
  name?: string;
}

export interface UICliAppAttachment {
  name: string;
  display_name?: string;
  category?: string;
  entry_point?: string;
  logo_url?: string | null;
  brand_color?: string | null;
}

export interface UIMcpPresetAttachment {
  name: string;
  display_name?: string;
  category?: string;
  transport?: string;
  status?: string;
  configured?: boolean;
  logo_url?: string | null;
  brand_color?: string | null;
}

export interface UIMessageSource {
  kind: "cron" | "local_trigger" | "trigger" | string;
  label?: string;
}

export interface SendAttachment {
  media: OutboundMedia;
  preview: UIMediaAttachment;
}

export type SlashCommandLifecycle =
  | "side_channel"
  | "finalize_active_turn"
  | "stop_active_turn"
  | "agent_turn"
  | "agent_turn_with_args";

export interface SlashCommand {
  command: string;
  title: string;
  description: string;
  icon: string;
  argHint: string;
  lifecycle: SlashCommandLifecycle;
  acceptsArgs: boolean;
}

export interface AppPackageRef {
  manager: string;
  name?: string;
}

export interface AppCapability {
  type: 'cli' | 'mcp' | 'skill' | string;
  entry_point?: string;
  package?: AppPackageRef;
  path?: string;
  transport?: string;
  command?: string;
  args?: string[];
  url?: string;
  fields?: Array<{
    name: string;
    target?: string;
    required?: boolean;
    secret?: boolean;
    env_var?: string | null;
  }>;
}

export interface AppPlan {
  supported: boolean;
  strategy?: string;
  managed_paths?: string[];
  verification?: string[];
}

export interface AppTrust {
  registry: string;
  level: string;
  review_status: string;
}

export interface AppManifest {
  schema: 'agent-app.v1' | string;
  id: string;
  display_name: string;
  version?: string;
  description: string;
  category: string;
  source: string;
  logo_url?: string | null;
  brand_color?: string | null;
  docs_url?: string | null;
  capabilities: AppCapability[];
  install: AppPlan;
  remove: AppPlan;
  trust: AppTrust;
}

export interface CliAppInfo {
  name: string;
  display_name: string;
  category: string;
  description: string;
  requires: string;
  source: string;
  entry_point: string;
  install_supported: boolean;
  installed: boolean;
  available: boolean;
  status: string;
  logo_url?: string | null;
  brand_color?: string | null;
  skill_installed: boolean;
  manifest?: AppManifest;
}

export interface CliAppsPayload {
  apps: CliAppInfo[];
  installed_count: number;
  catalog_updated_at?: string | null;
  catalog_refresh_pending?: boolean;
  last_action?: {
    ok: boolean;
    message: string;
    installed?: boolean;
    removed?: boolean;
    output?: string | null;
    still_available?: boolean;
    verification?: string[];
    verification_failed?: string[];
  };
}

export interface McpPresetField {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
  configured: boolean;
  placeholder?: string;
  env_var?: string | null;
}

export interface McpPresetInfo {
  name: string;
  display_name: string;
  category: string;
  description: string;
  docs_url: string;
  transport: 'stdio' | 'streamableHttp' | 'sse' | 'oauth' | string;
  requires: string;
  note: string;
  install_supported: boolean;
  installed: boolean;
  configured: boolean;
  available: boolean;
  status: string;
  logo_url?: string | null;
  brand_color?: string | null;
  required_fields: McpPresetField[];
  connection_summary: string;
  tool_count?: number;
  tool_names?: string[];
  checked_at?: string | null;
  error?: string | null;
  enabled_tools?: string[];
  source?: 'preset' | 'custom' | string;
  manifest?: AppManifest;
}

export interface McpPresetsPayload {
  presets: McpPresetInfo[];
  installed_count: number;
  requires_restart?: boolean;
  hot_reload?: {
    ok: boolean;
    message: string;
    added?: string[];
    changed?: string[];
    removed?: string[];
    retried?: string[];
    connected?: string[];
    configured?: string[];
    failed?: string[];
    tools_removed?: number;
    requires_restart?: boolean;
  };
  last_action?: {
    ok: boolean;
    message: string;
    installed?: boolean;
    removed?: boolean;
    managed_paths_removed?: string[];
    verification?: string[];
    verification_failed?: string[];
    tool_count?: number;
    tool_names?: string[];
    checked_at?: string | null;
    error?: string | null;
  };
}

export interface SkillSummary {
  name: string;
  description: string;
  source: "workspace" | "builtin" | string;
  available: boolean;
  unavailable_reason?: string;
}

export interface SkillRequirements {
  bins: string[];
  env: string[];
  missing_bins: string[];
  missing_env: string[];
}

export interface SkillDetail extends SkillSummary {
  requirements: SkillRequirements;
  raw_markdown: string;
}

export interface SkillsPayload {
  skills: SkillSummary[];
}

export interface AutomationRunHistoryEntry {
  run_at_ms: number;
  status: "ok" | "error" | "skipped" | string;
  duration_ms?: number;
  error?: string | null;
}

export interface SessionAutomationJob {
  id: string;
  name: string;
  enabled: boolean;
  protected?: boolean;
  delete_after_run?: boolean;
  created_at_ms?: number | null;
  updated_at_ms?: number | null;
  kind?: "local_trigger" | "cron" | string;
  schedule: {
    kind: "at" | "every" | "cron" | "local" | string;
    at_ms?: number | null;
    every_ms?: number | null;
    expr?: string | null;
    tz?: string | null;
  };
  payload: {
    message: string;
    kind?: "agent_turn" | "system_event" | "local_trigger" | string;
    command?: string;
  };
  state: {
    next_run_at_ms?: number | null;
    last_run_at_ms?: number | null;
    last_status?: "ok" | "error" | "skipped" | string | null;
    last_error?: string | null;
    pending?: boolean;
    run_history?: AutomationRunHistoryEntry[];
  };
  origin?: {
    session_key?: string;
    channel: string;
    chat_id?: string;
    title?: string;
    preview?: string;
  } | null;
  trigger?: {
    id: string;
    command: string;
  };
}

export interface AutomationsPayload {
  jobs: SessionAutomationJob[];
}

export interface AutomationUpdatePayload {
  name?: string;
  message?: string;
  schedule?: {
    kind: "at" | "every" | "cron";
    at_ms?: number;
    every_ms?: number;
    expr?: string;
    tz?: string;
  };
}

export interface SendMessageOptions {
  cliApps?: UICliAppAttachment[];
  mcpPresets?: UIMcpPresetAttachment[];
  quotedContext?: string;
  workspaceScope?: WorkspaceScopePayload | null;
  sideChannel?: boolean;
  finalizeActiveTurn?: boolean;
  continueActiveTurn?: boolean;
}

export type StreamError =
  | { kind: "message_too_big"; chatId?: string; turnId?: string }
  | {
      kind: "workspace_scope_rejected";
      reason?: string;
      chatId?: string;
      turnId?: string;
    }
  | {
      kind: "turn_rejected";
      detail?: string;
      reason?: string;
      chatId: string;
      turnId: string;
    };

export type AttachmentStatus = "encoding" | "ready" | "error";

export interface ComposerAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  uri: string;
  mime: string;
  size: number;
  status: AttachmentStatus;
  dataUrl?: string;
  encodedBytes?: number;
  error?: string;
}

export interface ToolProgressEvent {
  version?: number;
  phase?: "start" | "end" | "error" | string;
  call_id?: string;
  name?: string;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
  files?: unknown[];
  embeds?: unknown[];
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
}

export interface UIFileDiff {
  format: "unified" | string;
  context?: number;
  truncated?: boolean;
  text?: string;
}

export interface UIFileEdit {
  version?: number;
  call_id: string;
  tool: string;
  path: string;
  absolute_path?: string;
  phase?: "start" | "end" | "error" | string;
  added: number;
  deleted: number;
  approximate?: boolean;
  status: "editing" | "done" | "error";
  operation?: "edit" | "delete" | string;
  binary?: boolean;
  error?: string;
  pending?: boolean;
  diff?: UIFileDiff;
}

export interface FilePreviewPayload {
  path: string;
  display_path: string;
  project_path: string;
  language: string;
  content: string;
  size: number;
  truncated: boolean;
}

export interface AgentUIBlob {
  kind: string;
  data?: unknown;
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  kind?: "message" | "trace";
  isStreaming?: boolean;
  createdAt: number;
  traces?: string[];
  toolEvents?: ToolProgressEvent[];
  fileEdits?: UIFileEdit[];
  activitySegmentId?: string;
  reasoning?: string;
  reasoningStreaming?: boolean;
  latencyMs?: number;
  completedAt?: number;
  source?: UIMessageSource;
  cliApps?: UICliAppAttachment[];
  mcpPresets?: UIMcpPresetAttachment[];
  turnId?: string;
  turnPhase?: "user" | "reasoning" | "activity" | "answer" | "complete";
  turnSeq?: number;
  media?: UIMediaAttachment[];
  images?: UIImage[];
}

export interface WebuiThreadPersistedPayload {
  schemaVersion: number;
  sessionKey?: string;
  savedAt?: string;
  messages: UIMessage[];
  fork_boundary_message_count?: number;
  /** Turn ids backed by an explicit persisted turn_end event. */
  completed_turn_ids?: string[];
  /** Server-authored activity state; absent on older gateways. */
  has_pending_tool_calls?: boolean;
  active_turn_id?: string | null;
  page?: {
    before_cursor?: string | null;
    has_more_before?: boolean;
    loaded_message_count?: number;
    total_known_message_count?: number;
    user_message_offset?: number;
  };
  workspace_scope?: WorkspaceScopePayload;
}

export interface FetchThreadOptions {
  limit?: number;
  direction?: "latest";
  before?: string | null;
}

export interface SessionDeleteResult {
  deleted: boolean;
  blocked_by_automations?: boolean;
  automations?: SessionAutomationJob[];
}

export type InboundEvent =
  | { event: "ready"; chat_id: string; client_id: string }
  | { event: "attached"; chat_id: string }
  | { event: "message_accepted"; chat_id: string; turn_id: string }
  | {
      event: "message";
      chat_id: string;
      text: string;
      kind?: "tool_hint" | "progress" | "reasoning";
      media?: string[];
      media_urls?: Array<{ url: string; name?: string }>;
      tool_events?: ToolProgressEvent[];
      latency_ms?: number;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
      reply_to?: string;
      source?: UIMessageSource;
      agent_ui?: AgentUIBlob;
    }
  | {
      event: "file_edit";
      chat_id: string;
      edits: UIFileEdit[];
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: "delta";
      chat_id: string;
      text: string;
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: "reasoning_delta";
      chat_id: string;
      text: string;
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: "reasoning_end";
      chat_id: string;
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: "stream_end";
      chat_id: string;
      stream_id?: string;
      text?: string;
      resuming?: boolean;
      merge_next?: boolean;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: "turn_end";
      chat_id: string;
      latency_ms?: number;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
      goal_state?: GoalStateWsPayload;
    }
  | {
      event: "goal_status";
      chat_id: string;
      status: "running" | "idle";
      started_at?: number;
      turn_id?: string;
    }
  | {
      event: "session_updated";
      chat_id: string;
      scope?: string;
      workspace_scope?: WorkspaceScopePayload;
    }
  | { event: "transcription_result"; request_id: string; text: string }
  | {
      event: "transcription_error";
      request_id?: string;
      detail?: string;
      provider?: string;
    }
  | {
      event: "runtime_model_updated";
      model_name: string;
      model_preset?: string | null;
    }
  | { event: "turn_model_updated"; chat_id: string; model_name: string }
  | { event: "goal_state"; chat_id: string; goal_state: GoalStateWsPayload }
  | {
      event: "error";
      chat_id?: string;
      detail?: string;
      reason?: string;
      turn_id?: string;
    };

export type RestartBehavior =
  "none" | "nextTurn" | "engineRestart" | "appRestart";
export type SettingsApplyStatus =
  | "idle"
  | "pending"
  | "applying"
  | "restarting_engine"
  | "requires_app_restart";
export type WebuiDefaultAccessMode = "default" | "full";

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

export type ChannelRuntimeStatus =
  "running" | "starting" | "failed" | "stopped" | string;

export interface ChannelSetupContractField {
  key: string;
  field: string;
  kind: "string" | "secret" | "int" | "bool" | "list" | "enum" | string;
  choices: string[];
  required: boolean;
  default_value?: string;
}

export interface ChannelSetupContract {
  fields: ChannelSetupContractField[];
  official_url?: string;
}

export type ChannelSetupMode = "webui" | "credentials" | "connect";

export interface ChannelConfigOption {
  value: string;
  label: string;
}

export interface ChannelConfigField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
  help?: string;
  inputType?: "text" | "number";
  defaultValue?: string;
  options?: ChannelConfigOption[];
}

export interface ChannelSetupAction {
  id: string;
  label: string;
  url?: string;
  copyText?: string;
  logoUrl?: string;
}

export interface ChannelProviderPreset {
  id: string;
  label: string;
  values: Record<string, string>;
}

export interface ChannelSetupPresentation {
  mode?: ChannelSetupMode;
  primaryActionLabel?: string;
  command?: string;
  docsUrl?: string;
  docsLabel?: string;
  docsLogoUrl?: string;
  officialUrl?: string;
  officialLabel?: string;
  summary?: string;
  tryIt?: string;
  steps: string[];
  fields?: ChannelConfigField[];
  manualFields?: ChannelConfigField[];
  actions?: ChannelSetupAction[];
  presets?: ChannelProviderPreset[];
}

export interface ChannelPresentation {
  displayName: string;
  initials: string;
  color: string;
  logoUrl?: string;
  description?: string;
  requirements?: string;
  canConnectBeforeConfigured?: boolean;
  setup: ChannelSetupPresentation;
}

export interface NanobotChannelInstanceInfo {
  id: string;
  name: string;
  display_name?: string;
  avatar_url?: string;
  enabled: boolean;
  running?: boolean;
  runtime_status?: ChannelRuntimeStatus;
  runtime_error?: string;
  configured: boolean;
  config_values: Record<string, string>;
  configured_fields: string[];
}

export interface NanobotFeatureInfo {
  name: string;
  display_name: string;
  capabilities?: string[];
  settings_visible?: boolean;
  webui?: string;
  type: "channel" | "feature" | string;
  enabled: boolean;
  running?: boolean;
  runtime_status?: ChannelRuntimeStatus;
  runtime_error?: string;
  configured?: boolean;
  config_values?: Record<string, string>;
  configured_fields?: string[];
  setup?: ChannelSetupContract;
  instances?: NanobotChannelInstanceInfo[];
  installed: boolean;
  ready: boolean;
  status: "enabled" | "missing_dependency" | "not_enabled" | string;
  install_supported: boolean;
  requires_restart: boolean;
}

export interface NanobotFeaturesPayload {
  features: NanobotFeatureInfo[];
  enabled_count: number;
  requires_restart?: boolean;
  last_action?: { ok: boolean; message: string; enabled?: boolean };
}

export interface ChannelValidationCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "skipped" | string;
  message?: string;
  action_url?: string;
}

export interface ChannelValidationPayload {
  name: string;
  status:
    | "connected"
    | "configured"
    | "needs_setup"
    | "invalid"
    | "unsupported"
    | string;
  checks: ChannelValidationCheck[];
  identity?: {
    name?: string;
    workspace?: string;
    account?: string;
    avatar_url?: string;
  };
  missing_fields: string[];
  can_enable: boolean;
  requires_restart: boolean;
  checked_at?: string;
  message?: string;
}

export interface PairingRequestInfo {
  code: string;
  channel: string;
  sender_id: string;
  created_at_ms?: number | null;
  expires_at_ms?: number | null;
  expires_in_seconds?: number | null;
}

export interface PairingPayload {
  requests: PairingRequestInfo[];
  last_action?: {
    ok: boolean;
    action: "approve" | "deny" | string;
    message: string;
    code?: string;
    channel?: string;
    sender_id?: string;
  };
}

export interface ChannelConnectPayload {
  session_id: string;
  instance_id?: string;
  status: "pending" | "succeeded" | "expired" | "cancelled" | "failed";
  message?: string;
  qr_url?: string;
  domain?: string;
  interval_ms?: number;
  expires_at_ms?: number;
  app_id?: string;
  account?: string;
  nanobot_features?: NanobotFeaturesPayload;
}

export interface ChannelConfigurePayload {
  name: string;
  saved: boolean;
  saved_keys?: string[];
  nanobot_features?: NanobotFeaturesPayload;
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
