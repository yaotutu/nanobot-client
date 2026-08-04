import { apiClient } from '@/services/api/api';
import type {
  CliAppsPayload,
  McpPresetsPayload,
} from '@/types/api/capabilities';
import type {
  SlashCommand,
  SlashCommandLifecycle,
} from '@/types/api/chat/commands';

const SLASH_COMMAND_LIFECYCLES = new Set<SlashCommandLifecycle>([
  'side_channel',
  'finalize_active_turn',
  'stop_active_turn',
  'agent_turn',
  'agent_turn_with_args',
]);

function isSlashCommandLifecycle(value: unknown): value is SlashCommandLifecycle {
  return typeof value === 'string' && SLASH_COMMAND_LIFECYCLES.has(value as SlashCommandLifecycle);
}

export async function listSlashCommands(): Promise<SlashCommand[]> {
  const body = await apiClient.get<{ commands?: Array<Record<string, unknown>> }>('/api/commands');
  return (body.commands ?? []).flatMap((row) => {
    if (
      typeof row.command !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.description !== 'string' ||
      typeof row.icon !== 'string' ||
      !isSlashCommandLifecycle(row.lifecycle)
    ) {
      return [];
    }
    return [
      {
        command: row.command,
        title: row.title,
        description: row.description,
        icon: row.icon,
        argHint: typeof row.arg_hint === 'string' ? row.arg_hint : '',
        lifecycle: row.lifecycle,
        acceptsArgs: row.accepts_args === true,
      },
    ];
  });
}

export async function fetchInstalledCliApps(): Promise<CliAppsPayload> {
  return apiClient.get<CliAppsPayload>('/api/settings/cli-apps', { installed_only: 1 });
}

export async function fetchCliApps(): Promise<CliAppsPayload> {
  return apiClient.get<CliAppsPayload>('/api/settings/cli-apps');
}

export async function runCliAppAction(
  action: 'install' | 'update' | 'uninstall' | 'test',
  name: string,
): Promise<CliAppsPayload> {
  return apiClient.request<CliAppsPayload>(
    `/api/settings/cli-apps/${action}`,
    { method: 'GET', query: { name } },
  );
}

export async function fetchMcpPresets(): Promise<McpPresetsPayload> {
  return apiClient.get<McpPresetsPayload>('/api/settings/mcp-presets');
}

function mcpValuesHeader(values: Record<string, unknown>): Record<string, string> | undefined {
  const payload = Object.fromEntries(
    Object.entries(values)
      .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v] as const)
      .filter(([, v]) => v !== '' && v !== undefined && v !== null),
  );
  if (Object.keys(payload).length === 0) return undefined;
  return { 'X-Nanobot-MCP-Values': JSON.stringify(payload) };
}

export async function runMcpPresetAction(
  action: 'enable' | 'remove' | 'test',
  name: string,
  values: Record<string, string> = {},
): Promise<McpPresetsPayload> {
  return apiClient.request<McpPresetsPayload>(
    `/api/settings/mcp-presets/${action}`,
    { method: 'GET', query: { name }, headers: mcpValuesHeader(values) },
  );
}

export async function saveCustomMcpServer(values: Record<string, string>): Promise<McpPresetsPayload> {
  return apiClient.request<McpPresetsPayload>(
    '/api/settings/mcp-presets/custom',
    { method: 'GET', headers: mcpValuesHeader(values) },
  );
}

export async function importMcpConfig(config: string): Promise<McpPresetsPayload> {
  return apiClient.request<McpPresetsPayload>(
    '/api/settings/mcp-presets/import',
    { method: 'GET', headers: mcpValuesHeader({ config }) },
  );
}

export async function updateMcpServerTools(name: string, enabledTools: string[]): Promise<McpPresetsPayload> {
  return apiClient.request<McpPresetsPayload>(
    '/api/settings/mcp-presets/tools',
    { method: 'GET', headers: mcpValuesHeader({ name, enabled_tools: enabledTools }) },
  );
}
