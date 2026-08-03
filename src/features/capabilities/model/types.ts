import type { CliAppInfo, McpPresetInfo } from '@/types/api/capabilities';

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
