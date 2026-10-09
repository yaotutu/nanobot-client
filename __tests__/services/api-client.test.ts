import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createApiClient } from '@/services/api/api-client';

const fetchMock = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function htmlResponse(status = 502) {
  const body = '<!doctype html><html><body>bad gateway</body></html>';
  return new Response(body, { status, statusText: 'Bad Gateway', headers: { 'content-type': 'text/html' } });
}

describe('createApiClient', () => {
  it('issues GET with bearer token and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hello: 'world' }));
    const client = createApiClient({ getBaseUrl: () => 'http://x', getToken: () => 'tok' });
    const out = await client.get<{ hello: string }>('/api/foo');
    expect(out).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://x/api/foo');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.Accept).toBe('application/json');
  });

  it('serializes query parameters, dropping empty values', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const client = createApiClient({ getBaseUrl: () => 'http://x', getToken: () => 'tok' });
    await client.get('/api/foo', { a: 1, b: '', c: undefined, d: null, e: 'x' });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://x/api/foo?a=1&e=x');
  });

  it('throws ApiError on non-2xx', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('Bad', { status: 401, statusText: 'Unauthorized' })));
    const client = createApiClient({ getBaseUrl: () => 'http://x', getToken: () => '' });
    await expect(client.get('/api/x')).rejects.toBeInstanceOf(ApiError);
    await expect(client.get('/api/x')).rejects.toMatchObject({ status: 401 });
  });

  it('throws ApiError when HTML returned instead of JSON', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(htmlResponse()));
    const client = createApiClient({ getBaseUrl: () => 'http://x', getToken: () => '' });
    await expect(client.get('/api/x')).rejects.toThrow(/html/i);
  });

  it('times out on slow responses', async () => {
    fetchMock.mockImplementationOnce((_, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const client = createApiClient({ getBaseUrl: () => 'http://x', getToken: () => '', defaultTimeoutMs: 50 });
    await expect(client.get('/api/slow')).rejects.toThrow();
  });

  it('rejects a pre-aborted request without calling fetch', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = createApiClient({ getBaseUrl: () => 'http://x', getToken: () => '' });

    const error = await client.get('/api/cancelled', undefined, { signal: controller.signal }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('AbortError');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps timeout active while reading the response body', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(async (_, init) => {
        const signal = init?.signal as AbortSignal;
        const response = {
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('body_read_timeout')), { once: true });
          }),
        };
        return response;
      });
      const client = createApiClient({ getBaseUrl: () => 'http://x', getToken: () => '' });
      const request = client.get('/api/slow-body', undefined, { timeoutMs: 20 });
      const assertion = expect(request).rejects.toThrow('body_read_timeout');

      await vi.advanceTimersByTimeAsync(20);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('forwards external abort and removes the listener after completion', async () => {
    fetchMock.mockImplementationOnce(async (_, init) => {
      const signal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('external_abort')), { once: true });
      });
    });
    const external = new AbortController();
    const addListener = vi.spyOn(external.signal, 'addEventListener');
    const removeListener = vi.spyOn(external.signal, 'removeEventListener');
    const client = createApiClient({ getBaseUrl: () => 'http://x', getToken: () => '' });
    const request = client.get('/api/external-abort', undefined, { signal: external.signal });

    external.abort();
    await expect(request).rejects.toThrow('external_abort');
    expect(addListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('omits Authorization header when token is empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const client = createApiClient({ getBaseUrl: () => 'http://x', getToken: () => '' });
    await client.get('/api/foo');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});


describe('dynamic base URL', () => {
  it('reads the base URL for every request without recreating the client', async () => {
    let baseUrl = 'http://first';
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})));
    const client = createApiClient({
      getBaseUrl: () => baseUrl,
      getToken: () => '',
    });

    await client.get('/api/foo');
    baseUrl = 'http://second';
    await client.get('/api/foo');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://first/api/foo',
      'http://second/api/foo',
    ]);
  });
});
