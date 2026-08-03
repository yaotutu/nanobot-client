import { apiClient } from '@/services/api/api';
import type { NanobotFeaturesPayload } from '@/types/api/nanobot-features';

export async function fetchNanobotFeatures(): Promise<NanobotFeaturesPayload> {
  return apiClient.get<NanobotFeaturesPayload>('/api/settings/nanobot-features');
}

export async function setNanobotFeatureEnabled(
  action: 'enable' | 'disable',
  name: string,
  instanceId?: string,
): Promise<NanobotFeaturesPayload> {
  return apiClient.request<NanobotFeaturesPayload>(
    `/api/settings/nanobot-features/${action}`,
    { method: 'GET', query: { name, ...(instanceId ? { instance_id: instanceId } : {}) } },
  );
}
