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
});
