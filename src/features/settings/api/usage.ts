import { apiClient } from '@/services/api/api';
import type { SettingsPayload } from '@/types/api/settings/payload';

export async function fetchSettingsUsage(): Promise<NonNullable<SettingsPayload['usage']>> {
  return apiClient.get<NonNullable<SettingsPayload['usage']>>('/api/settings/usage');
}
