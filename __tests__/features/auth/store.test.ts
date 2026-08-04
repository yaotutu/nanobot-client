import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchBootstrap } from '@/features/auth/api';
import { bootstrapSessionManager } from '@/features/auth/bootstrap-session-manager';
import { useAuthStore } from '@/features/auth/store';
import {
  clearBootstrapSecret,
  loadBootstrapSecret,
  saveBootstrapSecret,
} from '@/services/credentials/auth-credentials';
import { loadLocalDevBootstrapSecret } from '@/services/credentials/local-dev-bootstrap';
import type { BootstrapResponse } from '@/types/api/runtime';

vi.mock('@/features/auth/api', () => ({
  BootstrapAuthRequiredError: class BootstrapAuthRequiredError extends Error {},
  fetchBootstrap: vi.fn(),
}));

vi.mock('@/services/credentials/auth-credentials', () => ({
  clearBootstrapSecret: vi.fn(),
  loadBootstrapSecret: vi.fn(),
  saveBootstrapSecret: vi.fn(),
}));

vi.mock('@/services/credentials/local-dev-bootstrap', () => ({
  loadLocalDevBootstrapSecret: vi.fn(),
}));

vi.mock('@/services/api/api', () => ({
  setApiTokenProvider: vi.fn(),
}));

const oldBootstrap = {
  token: 'old-ws-token',
  api_token: 'old-api-token',
  ws_path: '/ws',
  expires_in: 60,
} as BootstrapResponse;

const freshBootstrap = {
  token: 'fresh-ws-token',
  api_token: 'fresh-api-token',
  ws_path: '/ws',
  expires_in: 60,
} as BootstrapResponse;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('useAuthStore bootstrap renewal', () => {
  beforeEach(() => {
    bootstrapSessionManager.cancel();
    vi.mocked(fetchBootstrap).mockReset();
    vi.mocked(loadBootstrapSecret).mockReset();
    vi.mocked(loadLocalDevBootstrapSecret).mockReset();
    vi.mocked(clearBootstrapSecret).mockReset();
    vi.mocked(saveBootstrapSecret).mockReset();
    useAuthStore.setState({
      phase: 'ready',
      bootstrap: oldBootstrap,
      apiToken: oldBootstrap.api_token,
      authenticationFailed: false,
      error: null,
      sessionEpoch: 1,
      tokenGeneration: 1,
      _bootstrapped: true,
    });
  });

  it('uses the persisted bootstrap issue secret instead of the API token', async () => {
    vi.mocked(loadBootstrapSecret).mockResolvedValue('bootstrap-issue-secret');
    vi.mocked(loadLocalDevBootstrapSecret).mockReturnValue('local-dev-secret');
    vi.mocked(fetchBootstrap).mockResolvedValue(freshBootstrap);

    await useAuthStore.getState().refreshBootstrap();

    expect(fetchBootstrap).toHaveBeenCalledWith(
      'bootstrap-issue-secret',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchBootstrap).not.toHaveBeenCalledWith('old-api-token');
    expect(useAuthStore.getState()).toMatchObject({
      bootstrap: freshBootstrap,
      apiToken: 'fresh-api-token',
      phase: 'ready',
    });
  });

  it('falls back to the local development bootstrap secret', async () => {
    vi.mocked(loadBootstrapSecret).mockResolvedValue('');
    vi.mocked(loadLocalDevBootstrapSecret).mockReturnValue('local-dev-secret');
    vi.mocked(fetchBootstrap).mockResolvedValue(freshBootstrap);

    await useAuthStore.getState().refreshBootstrap();

    expect(fetchBootstrap).toHaveBeenCalledWith(
      'local-dev-secret',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('deduplicates concurrent refreshes and applies the renewed token once', async () => {
    vi.mocked(loadBootstrapSecret).mockResolvedValue('bootstrap-issue-secret');
    vi.mocked(loadLocalDevBootstrapSecret).mockReturnValue('local-dev-secret');
    const request = deferred<BootstrapResponse>();
    vi.mocked(fetchBootstrap).mockReturnValue(request.promise);

    const first = useAuthStore.getState().refreshBootstrap();
    const second = useAuthStore.getState().refreshBootstrap('socket-reauthentication');
    await vi.waitFor(() => expect(fetchBootstrap).toHaveBeenCalledOnce());
    request.resolve(freshBootstrap);

    await expect(Promise.all([first, second])).resolves.toEqual([
      freshBootstrap,
      freshBootstrap,
    ]);
    expect(useAuthStore.getState().tokenGeneration).toBe(2);
  });

});
