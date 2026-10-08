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
 * 默认不绑定任何服务器地址。客户端面向连接自建 nanobot 网关的用户，首次启动先填写服务器。
 * 本地开发如需默认地址，通过 EXPO_PUBLIC_NANOBOT_SERVER_URL 注入；发布构建保持为空。
 */
function resolveDefaultServerUrl(): string {
  return normalizeServerUrl(process.env.EXPO_PUBLIC_NANOBOT_SERVER_URL ?? '') ?? '';
}

export const DEFAULT_SERVER_URL = resolveDefaultServerUrl();

let currentServerUrl = DEFAULT_SERVER_URL;

/** 读取当前进程内的网关地址；未配置时为空字符串，认证流程会在发起请求前拦截。 */
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
