/**
 * nanobot 功能资源的共享网关客户端。
 *
 * channels 与 settings 都依赖同一组后端能力配置，因此该模块有意保留在 services/api，
 * 而不是归入任一 feature；这样可以避免其中一个业务域成为另一个业务域的基础依赖。
 */
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
