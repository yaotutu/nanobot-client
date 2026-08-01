import { apiClient } from '@/services/api';
import type { WorkspacesPayload } from '@/types/api';

export async function fetchWorkspaces(): Promise<WorkspacesPayload> {
  return apiClient.get<WorkspacesPayload>('/api/workspaces');
}
