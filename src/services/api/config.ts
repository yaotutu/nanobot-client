const LAN_SERVER_URL = 'http://192.168.55.201:8765';

/**
 * 规范化用户输入的网关地址。
 *
 * 只接受 http/https URL，并移除末尾斜杠，避免拼接 API path 时出现双斜杠。
 * 返回 null 表示地址不可用，由 UI 在提交前阻止保存。
 */
export function normalizeServerUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    if (url.username || url.password) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * 默认连接指定的局域网网关，开发版和发布版保持一致，避免开发时意外连接 USB 反向代理或模拟器地址。
 * 构建时仍可通过 EXPO_PUBLIC_NANOBOT_SERVER_URL 改变初始默认值。
 */
function resolveDefaultServerUrl(): string {
  const override = normalizeServerUrl(process.env.EXPO_PUBLIC_NANOBOT_SERVER_URL ?? '');
  return override ?? LAN_SERVER_URL;
}

export const DEFAULT_SERVER_URL = resolveDefaultServerUrl();

let currentServerUrl = DEFAULT_SERVER_URL;

/** 读取当前进程内的网关地址。 */
export function getServerUrl(): string {
  return currentServerUrl;
}

/** API、WebSocket 和静态资源链接始终读取当前值，天然支持运行时切换。 */
export function setServerUrl(value: string): boolean {
  const normalized = normalizeServerUrl(value);
  if (!normalized) return false;
  currentServerUrl = normalized;
  return true;
}
