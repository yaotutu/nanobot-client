import type { CustomMcpForm } from './types';

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
