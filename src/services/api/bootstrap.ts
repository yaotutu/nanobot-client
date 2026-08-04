import type { BootstrapResponse } from '@/types/api/runtime';
export type { BootstrapResponse };

/** 网关明确拒绝凭据，或成功响应缺失建立会话所需的关键字段。 */
export class BootstrapAuthRequiredError extends Error {
  constructor(message = 'bootstrap authentication required') {
    super(message);
    this.name = 'BootstrapAuthRequiredError';
  }
}

export type BootstrapResponseErrorCode = 'gateway_html_response' | 'non_json_response';

/**
 * bootstrap 返回了可响应但不可解析的内容。
 *
 * service 层只暴露稳定错误码，不依赖 i18n；由 auth feature 在用户界面边界翻译文案。
 */
export class BootstrapResponseError extends Error {
  constructor(public readonly code: BootstrapResponseErrorCode) {
    super(code);
    this.name = 'BootstrapResponseError';
  }
}

export interface FetchBootstrapOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * 获取一次 bootstrap 凭据，并把调用方取消信号与本地超时合并到同一个 AbortController。
 * finally 中必须同时清理计时器和外部 signal 监听，避免多次静默续期后累积监听器。
 */
export async function fetchBootstrap(
  baseUrl: string,
  secret: string,
  options: FetchBootstrapOptions = {},
): Promise<BootstrapResponse> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await fetch(`${baseUrl}/webui/bootstrap`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(secret ? { 'X-Nanobot-Auth': secret } : {}),
      },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new BootstrapAuthRequiredError(`bootstrap failed: HTTP ${response.status}`);
    }
    if (!response.ok) throw new Error(`bootstrap failed: HTTP ${response.status}`);
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (contentType && !contentType.toLowerCase().includes('application/json')) {
      const text = typeof response.text === 'function' ? await response.text() : '';
      const isHtml = text.trimStart().toLowerCase().startsWith('<!doctype')
        || text.trimStart().toLowerCase().startsWith('<html');
      throw new BootstrapResponseError(
        isHtml ? 'gateway_html_response' : 'non_json_response',
      );
    }
    const body = (await response.json()) as BootstrapResponse;
    if (!body.token || !body.ws_path || !body.api_token) {
      throw new BootstrapAuthRequiredError('bootstrap response missing credentials');
    }
    return body;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

/** 将 bootstrap 的相对 ws_path 或绝对 ws_url 归一化为带一次性 token 的连接地址。 */
export function deriveWsUrl(
  baseUrl: string,
  wsPath: string,
  token: string,
  wsUrl?: string | null,
): string {
  if (wsUrl && /^wss?:\/\//i.test(wsUrl)) {
    const joiner = wsUrl.includes('?') ? '&' : '?';
    return `${wsUrl}${joiner}token=${encodeURIComponent(token)}`;
  }
  const base = new URL(baseUrl);
  const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = wsPath.startsWith('/') ? wsPath : `/${wsPath}`;
  return `${scheme}//${base.host}${path}?token=${encodeURIComponent(token)}`;
}
