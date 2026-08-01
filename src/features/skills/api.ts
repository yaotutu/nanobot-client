import { apiClient } from '@/services/api';
import type { SkillDetail, SkillsPayload } from '@/types/api';

export async function fetchSkills(): Promise<SkillsPayload> {
  return apiClient.get<SkillsPayload>('/api/webui/skills');
}

export async function fetchSkillDetail(name: string): Promise<SkillDetail> {
  return apiClient.get<SkillDetail>(`/api/webui/skills/${encodeURIComponent(name)}`);
}
