import { apiClient } from '@/services/api/api';
import type { VersionCheckResult } from '@/types/api/settings/updates';

export async function checkVersion(): Promise<VersionCheckResult> {
  return apiClient.request<VersionCheckResult>('/api/settings/version-check', {
    method: 'GET',
    timeoutMs: 10_000,
  });
}
