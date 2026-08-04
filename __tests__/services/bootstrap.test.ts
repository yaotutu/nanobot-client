import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BootstrapResponseError,
  fetchBootstrap,
} from '@/services/api/bootstrap';

const fetchMock = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchBootstrap response validation', () => {
  it('classifies WebUI HTML separately from other invalid payloads', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));

    await expect(fetchBootstrap('http://gateway', 'secret')).rejects.toMatchObject({
      name: 'BootstrapResponseError',
      code: 'gateway_html_response',
    });
  });

  it('returns a structured non-JSON response error without translating in the service layer', async () => {
    fetchMock.mockResolvedValueOnce(new Response('temporarily unavailable', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }));

    const error = await fetchBootstrap('http://gateway', 'secret').catch((caught) => caught);
    expect(error).toBeInstanceOf(BootstrapResponseError);
    expect(error).toMatchObject({ code: 'non_json_response' });
  });
});
