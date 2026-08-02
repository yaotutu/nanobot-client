import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';

export type AppsFilter = 'ready' | 'cli' | 'mcp';
export type AppAction = 'install' | 'update' | 'uninstall' | 'test';
export type McpAction = 'enable' | 'remove' | 'test';
export type CustomMcpTransport = 'stdio' | 'streamableHttp' | 'sse';
export type CustomMcpMode = 'custom' | 'import' | null;
export type CatalogItem =
  | { id: string; kind: 'cli'; app: CliAppInfo }
  | { id: string; kind: 'mcp'; preset: McpPresetInfo };

export interface CustomMcpForm {
  name: string;
  transport: CustomMcpTransport;
  command: string;
  args: string;
  url: string;
  env: string;
  headers: string;
  toolTimeout: string;
}

export const CLI_APPS_REFRESH_RETRY_MS = 2_000;
export const CLI_APPS_REFRESH_MAX_RETRIES = 30;
export const DEFAULT_CUSTOM_MCP_FORM: CustomMcpForm = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  env: '',
  headers: '',
  toolTimeout: '30',
};

export function titleOf(item: CatalogItem): string {
  return item.kind === 'cli' ? item.app.display_name : item.preset.display_name;
}

export function itemReady(item: CatalogItem): boolean {
  return item.kind === 'cli'
    ? item.app.installed
    : item.preset.installed && item.preset.configured;
}

export function searchText(item: CatalogItem): string {
  if (item.kind === 'cli') {
    const { app } = item;
    return [
      app.display_name,
      app.name,
      app.category,
      app.description,
      app.requires,
      app.entry_point,
      app.source,
    ].join(' ').toLocaleLowerCase();
  }
  const { preset } = item;
  return [
    preset.display_name,
    preset.name,
    preset.category,
    preset.description,
    preset.transport,
    preset.requires,
    preset.note,
    preset.connection_summary,
    ...(preset.tool_names ?? []),
  ].join(' ').toLocaleLowerCase();
}
