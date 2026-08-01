import i18n from '@/i18n';
import type { BootstrapResponse } from "@/types/api";
export type { BootstrapResponse };

export class BootstrapAuthRequiredError extends Error {
  constructor(message = 'bootstrap authentication required') {
    super(message);
    this.name = 'BootstrapAuthRequiredError';
  }
}

export async function fetchBootstrap(
  baseUrl: string,
  secret: string,
  timeoutMs = 20_000,
): Promise<BootstrapResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      throw new Error(isHtml
        ? i18n.t('app.error.gatewayHtmlResponse', {
            defaultValue: 'Gateway returned WebUI HTML instead of JSON. Restart nanobot gateway and try again.',
          })
        : i18n.t('app.error.nonJsonResponse', {
            defaultValue: 'Gateway returned a non-JSON response.',
          }));
    }
    const body = (await response.json()) as BootstrapResponse;
    if (!body.token || !body.ws_path || !body.api_token) {
      throw new BootstrapAuthRequiredError('bootstrap response missing credentials');
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

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
