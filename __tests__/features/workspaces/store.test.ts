import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWorkspaces } from '@/features/workspaces/api';
import { useWorkspacesStore } from '@/features/workspaces/store';
import type { WorkspacesPayload } from '@/types/api/workspaces';

vi.mock('@/features/workspaces/api', () => ({
  fetchWorkspaces: vi.fn(),
}));

const payload: WorkspacesPayload = {
  schema_version: 1,
  default_access_mode: 'default',
  default_scope: {
    project_path: '/workspace',
    project_name: 'workspace',
    access_mode: 'restricted',
  },
  controls: {
    can_change_project: true,
    can_use_full_access: false,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('useWorkspacesStore', () => {
  beforeEach(() => {
    vi.mocked(fetchWorkspaces).mockReset();
    useWorkspacesStore.getState().resetAll();
  });

  it('stores a successful workspace response', async () => {
    vi.mocked(fetchWorkspaces).mockResolvedValue(payload);

    await useWorkspacesStore.getState().refresh();

    expect(useWorkspacesStore.getState()).toMatchObject({
      workspaces: payload,
      loading: false,
      error: null,
    });
  });

  it('keeps the last successful response when refresh fails', async () => {
    vi.mocked(fetchWorkspaces)
      .mockResolvedValueOnce(payload)
      .mockRejectedValueOnce(new Error('Workspace service unavailable'));

    await useWorkspacesStore.getState().refresh();
    await useWorkspacesStore.getState().refresh();

    expect(useWorkspacesStore.getState()).toMatchObject({
      workspaces: payload,
      loading: false,
      error: 'Workspace service unavailable',
    });
  });

  it('does not restore an old server response after reset', async () => {
    const old = deferred<WorkspacesPayload>();
    vi.mocked(fetchWorkspaces).mockReturnValueOnce(old.promise);
    const refresh = useWorkspacesStore.getState().refresh();

    useWorkspacesStore.getState().resetAll();
    old.resolve(payload);
    await refresh;

    expect(useWorkspacesStore.getState()).toMatchObject({
      workspaces: null, error: null, loading: false,
    });
  });

  it('does not overwrite a new environment with an old request error', async () => {
    const old = deferred<WorkspacesPayload>();
    vi.mocked(fetchWorkspaces).mockReturnValueOnce(old.promise).mockResolvedValueOnce(payload);
    const oldRefresh = useWorkspacesStore.getState().refresh();

    useWorkspacesStore.getState().resetAll();
    await useWorkspacesStore.getState().refresh();
    old.reject(new Error('old server unavailable'));
    await oldRefresh;

    expect(useWorkspacesStore.getState()).toMatchObject({
      workspaces: payload, error: null, loading: false,
    });
  });

  it('keeps the latest refresh when responses arrive out of order', async () => {
    const old = deferred<WorkspacesPayload>();
    const latest = deferred<WorkspacesPayload>();
    vi.mocked(fetchWorkspaces).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const oldRefresh = useWorkspacesStore.getState().refresh();
    const latestRefresh = useWorkspacesStore.getState().refresh();

    old.resolve({ ...payload, default_access_mode: 'full' });
    await oldRefresh;
    expect(useWorkspacesStore.getState().loading).toBe(true);

    latest.resolve(payload);
    await latestRefresh;
    expect(useWorkspacesStore.getState()).toMatchObject({
      workspaces: payload, error: null, loading: false,
    });
  });
});
