const LAN_SERVER_URL = 'http://192.168.55.201:8765';

export function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * 默认连接指定的局域网网关，开发版和发布版保持一致，避免开发时意外连接 USB 反向代理或模拟器地址。
 * 需要临时切换服务端时，仍可通过构建时的 EXPO_PUBLIC_NANOBOT_SERVER_URL 覆盖。
 */
function resolveDefaultServerUrl(): string {
  const override = process.env.EXPO_PUBLIC_NANOBOT_SERVER_URL;
  return override && override.trim() ? normalizeServerUrl(override) : LAN_SERVER_URL;
}

export const DEFAULT_SERVER_URL = resolveDefaultServerUrl();
