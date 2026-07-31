import type {
  ApiServicePayload,
  AutomationUpdatePayload,
  AutomationsPayload,
  ChannelConfigurePayload,
  ChannelConnectPayload,
  ChannelValidationPayload,
  ChatSummary,
  CliAppsPayload,
  FetchThreadOptions,
  FilePreviewPayload,
  ImageGenerationSettingsUpdate,
  McpPresetsPayload,
  NanobotFeaturesPayload,
  ModelConfigurationCreate,
  ModelConfigurationUpdate,
  NetworkSafetySettingsUpdate,
  PairingPayload,
  ProviderCreationUpdate,
  ProviderModelsPayload,
  ProviderOAuthCompletionResult,
  ProviderOAuthLoginResult,
  ProviderSettingsUpdate,
  SessionDeleteResult,
  SlashCommand,
  SlashCommandLifecycle,
  SidebarStatePayload,
  SkillDetail,
  SkillsPayload,
  SettingsPayload,
  SettingsUpdate,
  TranscriptionSettingsUpdate,
  VersionCheckResult,
  WebSearchSettingsUpdate,
  WebuiThreadPersistedPayload,
  WorkspacesPayload,
  WorkspaceScopePayload,
} from "@/types/nanobot";
import i18n from "@/i18n";

const CHANNEL_VALUES_HEADER = "X-Nanobot-Channel-Values";
const API_SERVICE_VALUES_HEADER = "X-Nanobot-API-Service-Values";
const OAUTH_CODE_HEADER = "X-Nanobot-OAuth-Code";
const PROVIDER_VALUES_HEADER = "X-Nanobot-Provider-Values";
const API_READ_TIMEOUT_MS = 20_000;

const SLASH_COMMAND_LIFECYCLES = new Set<SlashCommandLifecycle>([
  "side_channel",
  "finalize_active_turn",
  "stop_active_turn",
  "agent_turn",
  "agent_turn_with_args",
]);

function isSlashCommandLifecycle(
  value: unknown,
): value is SlashCommandLifecycle {
  return (
    typeof value === "string" &&
    SLASH_COMMAND_LIFECYCLES.has(value as SlashCommandLifecycle)
  );
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    const text =
      typeof response.text === "function" ? await response.text() : "";
    const isHtml = text.trimStart().toLowerCase().startsWith("<!doctype");
    throw new ApiError(
      response.status,
      isHtml
        ? i18n.t("app.error.gatewayHtmlResponse", {
            defaultValue:
              "Gateway returned WebUI HTML instead of JSON. Restart nanobot gateway and try again.",
          })
        : i18n.t("app.error.nonJsonResponse", {
            defaultValue: "Gateway returned a non-JSON response.",
          }),
    );
  }
  return (await response.json()) as T;
}

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
  timeoutMs = 0,
): Promise<T> {
  const shouldTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const controller = shouldTimeout ? new AbortController() : null;
  const timer = shouldTimeout
    ? setTimeout(() => controller?.abort(), timeoutMs)
    : undefined;
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...init?.headers,
      },
      signal: controller?.signal ?? init?.signal,
    });
    if (!response.ok) {
      const message = (await response.text()).trim();
      throw new ApiError(response.status, message || `HTTP ${response.status}`);
    }
    return parseJsonResponse<T>(response);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function readRequest<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  return request<T>(url, token, init, API_READ_TIMEOUT_MS);
}

function splitKey(key: string): { channel: string; chatId: string } {
  const separator = key.indexOf(":");
  return separator < 0
    ? { channel: "", chatId: key }
    : { channel: key.slice(0, separator), chatId: key.slice(separator + 1) };
}

export async function listSessions(
  baseUrl: string,
  token: string,
): Promise<ChatSummary[]> {
  type SessionRow = {
    key: string;
    created_at: string | null;
    updated_at: string | null;
    title?: string;
    preview?: string;
    model_preset?: string | null;
    run_started_at?: number | null;
    workspace_scope?: WorkspaceScopePayload | null;
  };
  const body = await readRequest<{ sessions: SessionRow[] }>(
    `${baseUrl}/api/sessions`,
    token,
  );
  return body.sessions.map((session) => ({
    key: session.key,
    ...splitKey(session.key),
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    title: session.title ?? "",
    preview: session.preview ?? "",
    modelPreset: session.model_preset ?? null,
    runStartedAt: session.run_started_at ?? null,
    workspaceScope: session.workspace_scope ?? null,
  }));
}

export async function fetchThread(
  baseUrl: string,
  token: string,
  key: string,
  options: FetchThreadOptions = {},
): Promise<WebuiThreadPersistedPayload | null> {
  const query = new URLSearchParams();
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  if (options.direction) query.set("direction", options.direction);
  if (options.before) query.set("before", options.before);
  const suffix = query.size > 0 ? `?${query}` : "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(
      `${baseUrl}/api/sessions/${encodeURIComponent(key)}/webui-thread${suffix}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      const message = (await response.text()).trim();
      throw new ApiError(response.status, message || `HTTP ${response.status}`);
    }
    return parseJsonResponse<WebuiThreadPersistedPayload>(response);
  } finally {
    clearTimeout(timer);
  }
}

export function fetchFilePreview(
  baseUrl: string,
  token: string,
  key: string,
  path: string,
): Promise<FilePreviewPayload> {
  const query = new URLSearchParams();
  query.set("path", path);
  return readRequest<FilePreviewPayload>(
    `${baseUrl}/api/sessions/${encodeURIComponent(key)}/file-preview?${query}`,
    token,
  );
}

export async function fetchFilePreviewAvailability(
  baseUrl: string,
  token: string,
  key: string,
  path: string,
): Promise<boolean> {
  const query = new URLSearchParams();
  query.set("path", path);
  query.set("probe", "1");
  const payload = await readRequest<{ available?: boolean }>(
    `${baseUrl}/api/sessions/${encodeURIComponent(key)}/file-preview?${query}`,
    token,
  );
  return payload.available !== false;
}

export function fetchSidebarState(
  baseUrl: string,
  token: string,
): Promise<SidebarStatePayload> {
  return readRequest<SidebarStatePayload>(
    `${baseUrl}/api/webui/sidebar-state`,
    token,
  );
}

export function fetchWorkspaces(
  baseUrl: string,
  token: string,
): Promise<WorkspacesPayload> {
  return readRequest<WorkspacesPayload>(`${baseUrl}/api/workspaces`, token);
}

export function updateSidebarState(
  baseUrl: string,
  token: string,
  state: SidebarStatePayload,
): Promise<SidebarStatePayload> {
  const query = new URLSearchParams({ state: JSON.stringify(state) });
  return request<SidebarStatePayload>(
    `${baseUrl}/api/webui/sidebar-state/update?${query}`,
    token,
  );
}

export function deleteSession(
  baseUrl: string,
  token: string,
  key: string,
  options?: { deleteAutomations?: boolean },
): Promise<SessionDeleteResult> {
  const query = new URLSearchParams();
  if (options?.deleteAutomations) query.set("delete_automations", "true");
  const suffix = query.size > 0 ? `?${query}` : "";
  return request<SessionDeleteResult>(
    `${baseUrl}/api/sessions/${encodeURIComponent(key)}/delete${suffix}`,
    token,
  );
}

export function fetchSessionAutomations(
  baseUrl: string,
  token: string,
  key: string,
): Promise<AutomationsPayload> {
  return readRequest<AutomationsPayload>(
    `${baseUrl}/api/sessions/${encodeURIComponent(key)}/automations`,
    token,
  );
}

export async function listSlashCommands(
  baseUrl: string,
  token: string,
): Promise<SlashCommand[]> {
  type SlashCommandRow = {
    command?: unknown;
    title?: unknown;
    description?: unknown;
    icon?: unknown;
    arg_hint?: unknown;
    lifecycle?: unknown;
    accepts_args?: unknown;
  };
  const body = await readRequest<{ commands?: SlashCommandRow[] }>(
    `${baseUrl}/api/commands`,
    token,
  );
  return (body.commands ?? []).flatMap((row) => {
    if (
      typeof row.command !== "string" ||
      typeof row.title !== "string" ||
      typeof row.description !== "string" ||
      typeof row.icon !== "string" ||
      !isSlashCommandLifecycle(row.lifecycle)
    )
      return [];
    return [
      {
        command: row.command,
        title: row.title,
        description: row.description,
        icon: row.icon,
        argHint: typeof row.arg_hint === "string" ? row.arg_hint : "",
        lifecycle: row.lifecycle,
        acceptsArgs: row.accepts_args === true,
      },
    ];
  });
}

export function fetchInstalledCliApps(
  baseUrl: string,
  token: string,
): Promise<CliAppsPayload> {
  return readRequest<CliAppsPayload>(
    `${baseUrl}/api/settings/cli-apps?installed_only=1`,
    token,
  );
}

export function fetchCliApps(
  baseUrl: string,
  token: string,
): Promise<CliAppsPayload> {
  return readRequest<CliAppsPayload>(`${baseUrl}/api/settings/cli-apps`, token);
}

export function runCliAppAction(
  baseUrl: string,
  token: string,
  action: "install" | "update" | "uninstall" | "test",
  name: string,
): Promise<CliAppsPayload> {
  const query = new URLSearchParams({ name });
  return request<CliAppsPayload>(
    `${baseUrl}/api/settings/cli-apps/${action}?${query}`,
    token,
  );
}

export function fetchMcpPresets(
  baseUrl: string,
  token: string,
): Promise<McpPresetsPayload> {
  return readRequest<McpPresetsPayload>(
    `${baseUrl}/api/settings/mcp-presets`,
    token,
  );
}

function mcpValuesHeader(
  values: Record<string, unknown>,
): HeadersInit | undefined {
  const payload = Object.fromEntries(
    Object.entries(values)
      .map(
        ([key, value]) =>
          [key, typeof value === "string" ? value.trim() : value] as const,
      )
      .filter(
        ([, value]) => value !== "" && value !== undefined && value !== null,
      ),
  );
  if (Object.keys(payload).length === 0) return undefined;
  return { "X-Nanobot-MCP-Values": JSON.stringify(payload) };
}

export function runMcpPresetAction(
  baseUrl: string,
  token: string,
  action: "enable" | "remove" | "test",
  name: string,
  values: Record<string, string> = {},
): Promise<McpPresetsPayload> {
  const query = new URLSearchParams({ name });
  return request<McpPresetsPayload>(
    `${baseUrl}/api/settings/mcp-presets/${action}?${query}`,
    token,
    { headers: mcpValuesHeader(values) },
  );
}

export function saveCustomMcpServer(
  baseUrl: string,
  token: string,
  values: Record<string, string>,
): Promise<McpPresetsPayload> {
  return request<McpPresetsPayload>(
    `${baseUrl}/api/settings/mcp-presets/custom`,
    token,
    { headers: mcpValuesHeader(values) },
  );
}

export function importMcpConfig(
  baseUrl: string,
  token: string,
  config: string,
): Promise<McpPresetsPayload> {
  return request<McpPresetsPayload>(
    `${baseUrl}/api/settings/mcp-presets/import`,
    token,
    { headers: mcpValuesHeader({ config }) },
  );
}

export function updateMcpServerTools(
  baseUrl: string,
  token: string,
  name: string,
  enabledTools: string[],
): Promise<McpPresetsPayload> {
  return request<McpPresetsPayload>(
    `${baseUrl}/api/settings/mcp-presets/tools`,
    token,
    { headers: mcpValuesHeader({ name, enabled_tools: enabledTools }) },
  );
}
function automationValuesHeader(values: AutomationUpdatePayload): HeadersInit {
  return {
    "X-Nanobot-Automation-Values": encodeURIComponent(JSON.stringify(values)),
  };
}

export function fetchAutomations(
  baseUrl: string,
  token: string,
): Promise<AutomationsPayload> {
  return readRequest<AutomationsPayload>(`${baseUrl}/api/webui/automations`, token);
}

export function runAutomationAction(
  baseUrl: string,
  token: string,
  action: "enable" | "disable" | "delete" | "run",
  id: string,
): Promise<AutomationsPayload> {
  const query = new URLSearchParams({ id });
  return readRequest<AutomationsPayload>(
    `${baseUrl}/api/webui/automations/${action}?${query}`,
    token,
  );
}

export function updateAutomation(
  baseUrl: string,
  token: string,
  id: string,
  values: AutomationUpdatePayload,
): Promise<AutomationsPayload> {
  const query = new URLSearchParams({ id });
  return readRequest<AutomationsPayload>(
    `${baseUrl}/api/webui/automations/update?${query}`,
    token,
    { headers: automationValuesHeader(values) },
  );
}

export function fetchSkills(
  baseUrl: string,
  token: string,
): Promise<SkillsPayload> {
  return readRequest<SkillsPayload>(`${baseUrl}/api/webui/skills`, token);
}

export function fetchSkillDetail(
  baseUrl: string,
  token: string,
  name: string,
): Promise<SkillDetail> {
  return readRequest<SkillDetail>(
    `${baseUrl}/api/webui/skills/${encodeURIComponent(name)}`,
    token,
  );
}

export function fetchSettings(
  baseUrl: string,
  token: string,
): Promise<SettingsPayload> {
  return readRequest<SettingsPayload>(`${baseUrl}/api/settings`, token);
}

export function fetchSettingsUsage(
  baseUrl: string,
  token: string,
): Promise<NonNullable<SettingsPayload["usage"]>> {
  return readRequest<NonNullable<SettingsPayload["usage"]>>(
    `${baseUrl}/api/settings/usage`,
    token,
  );
}

export function checkVersion(
  baseUrl: string,
  token: string,
): Promise<VersionCheckResult> {
  return request<VersionCheckResult>(
    `${baseUrl}/api/settings/version-check`,
    token,
    undefined,
    10_000,
  );
}

export function updateSettings(
  baseUrl: string,
  token: string,
  update: SettingsUpdate,
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  if (update.modelPreset !== undefined)
    query.set("model_preset", update.modelPreset ?? "default");
  if (update.model !== undefined) query.set("model", update.model);
  if (update.provider !== undefined) query.set("provider", update.provider);
  if (update.contextWindowTokens !== undefined) {
    query.set("context_window_tokens", String(update.contextWindowTokens));
  }
  if (update.timezone !== undefined) query.set("timezone", update.timezone);
  if (update.botName !== undefined) query.set("bot_name", update.botName);
  if (update.botIcon !== undefined) query.set("bot_icon", update.botIcon);
  if (update.toolHintMaxLength !== undefined) {
    query.set("tool_hint_max_length", String(update.toolHintMaxLength));
  }
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/update?${query}`,
    token,
  );
}

function appendModelGenerationSettings(
  query: URLSearchParams,
  configuration: Pick<
    ModelConfigurationCreate,
    "maxTokens" | "contextWindowTokens" | "temperature" | "reasoningEffort"
  >,
): void {
  if (configuration.maxTokens !== undefined)
    query.set("max_tokens", String(configuration.maxTokens));
  if (configuration.contextWindowTokens !== undefined) {
    query.set(
      "context_window_tokens",
      String(configuration.contextWindowTokens),
    );
  }
  if (configuration.temperature !== undefined)
    query.set("temperature", String(configuration.temperature));
  if (configuration.reasoningEffort !== undefined) {
    query.set("reasoning_effort", configuration.reasoningEffort ?? "");
  }
}

export function createModelConfiguration(
  baseUrl: string,
  token: string,
  configuration: ModelConfigurationCreate,
): Promise<SettingsPayload> {
  const query = new URLSearchParams({
    label: configuration.label,
    provider: configuration.provider,
    model: configuration.model,
  });
  if (configuration.name !== undefined) query.set("name", configuration.name);
  appendModelGenerationSettings(query, configuration);
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/model-configurations/create?${query}`,
    token,
  );
}

export function updateModelConfiguration(
  baseUrl: string,
  token: string,
  configuration: ModelConfigurationUpdate,
): Promise<SettingsPayload> {
  const query = new URLSearchParams({ name: configuration.name });
  if (configuration.label !== undefined)
    query.set("label", configuration.label);
  if (configuration.provider !== undefined)
    query.set("provider", configuration.provider);
  if (configuration.model !== undefined)
    query.set("model", configuration.model);
  appendModelGenerationSettings(query, configuration);
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/model-configurations/update?${query}`,
    token,
  );
}

export function deleteModelConfiguration(
  baseUrl: string,
  token: string,
  name: string,
): Promise<SettingsPayload> {
  const query = new URLSearchParams({ name });
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/model-configurations/delete?${query}`,
    token,
  );
}

export function migrateModelConfigurations(
  baseUrl: string,
  token: string,
): Promise<SettingsPayload> {
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/model-configurations/migrate`,
    token,
  );
}

export function updateModelCallOrder(
  baseUrl: string,
  token: string,
  order: string[],
): Promise<SettingsPayload> {
  const query = new URLSearchParams({ order: JSON.stringify(order) });
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/model-call-order/update?${query}`,
    token,
  );
}

export function fetchProviderModels(
  baseUrl: string,
  token: string,
  provider: string,
): Promise<ProviderModelsPayload> {
  const query = new URLSearchParams({ provider });
  return readRequest<ProviderModelsPayload>(
    `${baseUrl}/api/settings/provider-models?${query}`,
    token,
  );
}

export function updateProviderSettings(
  baseUrl: string,
  token: string,
  update: ProviderSettingsUpdate,
): Promise<SettingsPayload> {
  const { provider, ...values } = update;
  const query = new URLSearchParams({ provider });
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/provider/update?${query}`,
    token,
    {
      headers: {
        [PROVIDER_VALUES_HEADER]: encodeURIComponent(JSON.stringify(values)),
      },
    },
  );
}

export function createProviderSettings(
  baseUrl: string,
  token: string,
  update: ProviderCreationUpdate,
): Promise<SettingsPayload> {
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/provider/create`,
    token,
    {
      headers: {
        [PROVIDER_VALUES_HEADER]: encodeURIComponent(JSON.stringify(update)),
      },
    },
  );
}

export function loginProviderOAuth(
  baseUrl: string,
  token: string,
  provider: string,
): Promise<ProviderOAuthLoginResult> {
  const query = new URLSearchParams({ provider });
  return request<ProviderOAuthLoginResult>(
    `${baseUrl}/api/settings/provider/oauth-login?${query}`,
    token,
    { cache: "no-store" },
  );
}

export function completeProviderOAuth(
  baseUrl: string,
  token: string,
  provider: string,
  flowId: string,
  authorizationCode?: string,
): Promise<ProviderOAuthCompletionResult> {
  const query = new URLSearchParams({ provider, flow_id: flowId });
  const headers = authorizationCode
    ? { [OAUTH_CODE_HEADER]: authorizationCode }
    : undefined;
  return request<ProviderOAuthCompletionResult>(
    `${baseUrl}/api/settings/provider/oauth-login/complete?${query}`,
    token,
    { cache: "no-store", ...(headers ? { headers } : {}) },
  );
}

export function logoutProviderOAuth(
  baseUrl: string,
  token: string,
  provider: string,
): Promise<SettingsPayload> {
  const query = new URLSearchParams({ provider });
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/provider/oauth-logout?${query}`,
    token,
  );
}

export function updateWebSearchSettings(
  baseUrl: string,
  token: string,
  update: WebSearchSettingsUpdate,
): Promise<SettingsPayload> {
  const query = new URLSearchParams({ provider: update.provider });
  if (update.apiKey !== undefined) query.set("api_key", update.apiKey);
  if (update.baseUrl !== undefined) query.set("base_url", update.baseUrl);
  if (update.maxResults !== undefined)
    query.set("max_results", String(update.maxResults));
  if (update.timeout !== undefined)
    query.set("timeout", String(update.timeout));
  if (update.useJinaReader !== undefined)
    query.set("use_jina_reader", String(update.useJinaReader));
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/web-search/update?${query}`,
    token,
  );
}

export function updateImageGenerationSettings(
  baseUrl: string,
  token: string,
  update: ImageGenerationSettingsUpdate,
): Promise<SettingsPayload> {
  const query = new URLSearchParams({
    enabled: String(update.enabled),
    provider: update.provider,
    model: update.model,
    default_aspect_ratio: update.defaultAspectRatio,
    default_image_size: update.defaultImageSize,
    max_images_per_turn: String(update.maxImagesPerTurn),
  });
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/image-generation/update?${query}`,
    token,
  );
}

export function updateTranscriptionSettings(
  baseUrl: string,
  token: string,
  update: TranscriptionSettingsUpdate,
): Promise<SettingsPayload> {
  const query = new URLSearchParams({
    enabled: String(update.enabled),
    provider: update.provider,
    model: update.model,
    language: update.language,
    max_duration_sec: String(update.maxDurationSec),
    max_upload_mb: String(update.maxUploadMb),
  });
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/transcription/update?${query}`,
    token,
  );
}

export function fetchNanobotFeatures(
  baseUrl: string,
  token: string,
): Promise<NanobotFeaturesPayload> {
  return readRequest<NanobotFeaturesPayload>(
    `${baseUrl}/api/settings/nanobot-features`,
    token,
  );
}

export function setNanobotFeatureEnabled(
  baseUrl: string,
  token: string,
  action: "enable" | "disable",
  name: string,
  instanceId?: string,
): Promise<NanobotFeaturesPayload> {
  const query = new URLSearchParams({ name });
  if (instanceId) query.set("instance_id", instanceId);
  return request<NanobotFeaturesPayload>(
    `${baseUrl}/api/settings/nanobot-features/${action}?${query}`,
    token,
  );
}

export function configureChannel(
  baseUrl: string,
  token: string,
  name: string,
  values: Record<string, string>,
  options: { enable?: boolean; instanceId?: string } = {},
): Promise<ChannelConfigurePayload> {
  const query = new URLSearchParams({ name });
  if (options.enable !== undefined) query.set("enable", String(options.enable));
  if (options.instanceId) query.set("instance_id", options.instanceId);
  return request<ChannelConfigurePayload>(
    `${baseUrl}/api/settings/channels/configure?${query}`,
    token,
    { headers: { [CHANNEL_VALUES_HEADER]: JSON.stringify(values) } },
  );
}

export function validateChannel(
  baseUrl: string,
  token: string,
  name: string,
  values: Record<string, string>,
  instanceId?: string,
): Promise<ChannelValidationPayload> {
  const query = new URLSearchParams({ name });
  if (instanceId) query.set("instance_id", instanceId);
  return request<ChannelValidationPayload>(
    `${baseUrl}/api/settings/channels/validate?${query}`,
    token,
    { headers: { [CHANNEL_VALUES_HEADER]: JSON.stringify(values) } },
  );
}

export function startChannelConnect(
  baseUrl: string,
  token: string,
  channel: string,
  options: {
    domain?: string;
    instanceId?: string;
    mode?: "replace" | "create";
    force?: boolean;
  } = {},
): Promise<ChannelConnectPayload> {
  const query = new URLSearchParams();
  if (options.domain) query.set("domain", options.domain);
  if (options.instanceId) query.set("instance_id", options.instanceId);
  if (options.mode) query.set("mode", options.mode);
  if (options.force) query.set("force", "true");
  const suffix = query.size ? `?${query}` : "";
  return request<ChannelConnectPayload>(
    `${baseUrl}/api/settings/channels/${encodeURIComponent(channel)}/connect/start${suffix}`,
    token,
  );
}

export function pollChannelConnect(
  baseUrl: string,
  token: string,
  channel: string,
  sessionId: string,
): Promise<ChannelConnectPayload> {
  const query = new URLSearchParams({ session_id: sessionId });
  return request<ChannelConnectPayload>(
    `${baseUrl}/api/settings/channels/${encodeURIComponent(channel)}/connect/poll?${query}`,
    token,
  );
}

export function cancelChannelConnect(
  baseUrl: string,
  token: string,
  channel: string,
  sessionId: string,
): Promise<ChannelConnectPayload> {
  const query = new URLSearchParams({ session_id: sessionId });
  return request<ChannelConnectPayload>(
    `${baseUrl}/api/settings/channels/${encodeURIComponent(channel)}/connect/cancel?${query}`,
    token,
  );
}

export function fetchApiService(
  baseUrl: string,
  token: string,
): Promise<ApiServicePayload> {
  return request<ApiServicePayload>(
    `${baseUrl}/api/settings/api-service`,
    token,
  );
}

export function startApiService(
  baseUrl: string,
  token: string,
  values: { host: string; port: number; timeout: number; apiKey?: string },
): Promise<ApiServicePayload> {
  const query = new URLSearchParams({
    host: values.host,
    port: String(values.port),
    timeout: String(values.timeout),
  });
  const headers =
    values.apiKey === undefined
      ? undefined
      : {
          [API_SERVICE_VALUES_HEADER]: JSON.stringify({
            api_key: values.apiKey,
          }),
        };
  return request<ApiServicePayload>(
    `${baseUrl}/api/settings/api-service/start?${query}`,
    token,
    { headers },
  );
}

export function stopApiService(
  baseUrl: string,
  token: string,
): Promise<ApiServicePayload> {
  return request<ApiServicePayload>(
    `${baseUrl}/api/settings/api-service/stop`,
    token,
  );
}

export function fetchPairingRequests(
  baseUrl: string,
  token: string,
): Promise<PairingPayload> {
  return readRequest<PairingPayload>(`${baseUrl}/api/settings/pairing`, token);
}

export function runPairingAction(
  baseUrl: string,
  token: string,
  action: "approve" | "deny",
  code: string,
): Promise<PairingPayload> {
  const query = new URLSearchParams({ code });
  return request<PairingPayload>(
    `${baseUrl}/api/settings/pairing/${action}?${query}`,
    token,
  );
}

export function updateNetworkSafetySettings(
  baseUrl: string,
  token: string,
  update: NetworkSafetySettingsUpdate,
): Promise<SettingsPayload> {
  const query = new URLSearchParams({
    webui_allow_local_service_access: String(
      update.webuiAllowLocalServiceAccess,
    ),
    webui_default_access_mode: update.webuiDefaultAccessMode,
  });
  return request<SettingsPayload>(
    `${baseUrl}/api/settings/network-safety/update?${query}`,
    token,
  );
}
