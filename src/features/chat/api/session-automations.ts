import { apiClient } from '@/services/api/api';
import type {
  AutomationsPayload,
  SessionAutomationJob,
} from '@/types/api/automations';

/**
 * 只读取当前会话绑定的定时任务。这里不封装启停、编辑或删除接口，
 * 避免把服务端管理能力重新带进精简后的聊天客户端。
 */
export async function fetchSessionAutomations(
  sessionKey: string,
): Promise<SessionAutomationJob[]> {
  const payload = await apiClient.get<AutomationsPayload>(
    `/api/sessions/${encodeURIComponent(sessionKey)}/automations`,
  );
  return payload.jobs;
}
