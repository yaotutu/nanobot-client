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

/** 仅用于聊天的 @ 提示，不提供 MCP 安装、配置或测试操作。 */
export async function fetchMcpPresets(): Promise<McpPresetsPayload> {
  return apiClient.get<McpPresetsPayload>('/api/settings/mcp-presets');
}
