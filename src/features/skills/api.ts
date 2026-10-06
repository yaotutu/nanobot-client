import { apiClient } from '@/services/api/api';
import type {
  SkillsPayload,
} from '@/types/api/capabilities';

export async function fetchSkills(): Promise<SkillsPayload> {
  return apiClient.get<SkillsPayload>('/api/webui/skills');
}
