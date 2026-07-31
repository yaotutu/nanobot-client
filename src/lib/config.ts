export const DEFAULT_SERVER_URL = 'http://192.168.55.147:8765';

export function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
