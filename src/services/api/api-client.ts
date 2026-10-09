
/**
 * 统一的 API 客户端。所有 endpoint 通过此客户端发起请求：
 *   - 自动注入 `Authorization: Bearer <token>`
 *   - 统一超时（默认 20s，包含响应体读取）和外部取消
 *   - HTTP 错误保留真实状态码；HTML/non-JSON 返回可识别的 ApiError
 *
 * 每个 feature 在自己的 `api.ts` 持有 `apiClient.request(...)` 调用，组件层不再
 * 直接接触 baseUrl / token。
 */
export interface ApiClientOptions {
  getBaseUrl: () => string;
  /** 返回当前可用的 API token；空串表示不发送 Authorization 头 */
  getToken: () => string;
  /** 默认超时，毫秒；0 表示不超时 */
  defaultTimeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** 覆盖默认超时 */
  timeoutMs?: number;
  /** `signal` 用于外部 AbortController */
  signal?: AbortSignal;
  /** 是否把 body 作为 JSON 序列化（默认 true） */
  jsonBody?: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, query?: RequestOptions['query'], options?: Omit<RequestOptions, 'method' | 'query' | 'body'>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;
}

function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value === '') continue;
    params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `?${suffix}` : '';
}

function isHtmlResponse(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    const text = typeof response.text === 'function' ? await response.text() : '';
    const message = isHtmlResponse(text)
      ? 'Gateway returned WebUI HTML instead of JSON. Restart nanobot gateway and try again.'
      : 'Gateway returned a non-JSON response.';
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const { getBaseUrl, getToken, defaultTimeoutMs = 20_000 } = opts;

  const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
    const url = `${getBaseUrl()}${path}${buildQuery(options.query)}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers,
    };
    if (options.body !== undefined) {
      if (options.jsonBody !== false) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      } else {
        init.body = options.body as BodyInit;
      }
    }

    const externalSignal = options.signal;
    // 已取消的任务不应再发起网络请求，尤其是切换会话后才完成准备工作的历史请求。
    if (externalSignal?.aborted) {
      const error = new Error('request_aborted');
      error.name = 'AbortError';
      throw error;
    }

    const shouldTimeout = (options.timeoutMs ?? defaultTimeoutMs) > 0;
    const controller = shouldTimeout ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), options.timeoutMs ?? defaultTimeoutMs)
      : undefined;
    const forwardAbort = () => controller?.abort();
    if (controller && externalSignal) {
      externalSignal.addEventListener('abort', forwardAbort, { once: true });
    }
    try {
      const response = await fetch(url, { ...init, signal: controller?.signal ?? options.signal });
      if (!response.ok) {
        const message = (await response.text()).trim();
        throw new ApiError(response.status, message || `HTTP ${response.status}`);
      }
      // 必须在 try 内等待读取完成，否则 finally 会在响应头到达时就撤销超时保护。
      return await parseJsonResponse<T>(response);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (controller && externalSignal) {
        externalSignal.removeEventListener('abort', forwardAbort);
      }
    }
  };

  return {
    request,
    get: (path, query, options) => request(path, { ...options, method: 'GET', query }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  };
}
