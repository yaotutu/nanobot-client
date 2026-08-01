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
    const client = createApiClient({ baseUrl: 'http://x', getToken: () => 'tok' });
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
    const client = createApiClient({ baseUrl: 'http://x', getToken: () => 'tok' });
    await client.get('/api/foo', { a: 1, b: '', c: undefined, d: null, e: 'x' });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://x/api/foo?a=1&e=x');
  });

  it('throws ApiError on non-2xx', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('Bad', { status: 401, statusText: 'Unauthorized' })));
    const client = createApiClient({ baseUrl: 'http://x', getToken: () => '' });
    await expect(client.get('/api/x')).rejects.toBeInstanceOf(ApiError);
    await expect(client.get('/api/x')).rejects.toMatchObject({ status: 401 });
  });

  it('throws ApiError when HTML returned instead of JSON', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(htmlResponse()));
    const client = createApiClient({ baseUrl: 'http://x', getToken: () => '' });
    await expect(client.get('/api/x')).rejects.toThrow(/html/i);
  });

  it('times out on slow responses', async () => {
    fetchMock.mockImplementationOnce((_, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const client = createApiClient({ baseUrl: 'http://x', getToken: () => '', defaultTimeoutMs: 50 });
    await expect(client.get('/api/slow')).rejects.toThrow();
  });

  it('omits Authorization header when token is empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const client = createApiClient({ baseUrl: 'http://x', getToken: () => '' });
    await client.get('/api/foo');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});
