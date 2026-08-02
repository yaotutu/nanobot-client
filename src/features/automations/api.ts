import { apiClient } from '@/services/api/api';
import type {
  AutomationsPayload,
  AutomationUpdatePayload,
} from '@/types/api/automations';

export async function fetchAutomations(): Promise<AutomationsPayload> {
  return apiClient.get<AutomationsPayload>('/api/webui/automations');
}

export async function runAutomationAction(
  action: 'enable' | 'disable' | 'delete' | 'run',
  id: string,
): Promise<AutomationsPayload> {
  return apiClient.get<AutomationsPayload>(`/api/webui/automations/${action}`, { id });
}

function automationValuesHeader(values: AutomationUpdatePayload): Record<string, string> {
  return {
    'X-Nanobot-Automation-Values': encodeURIComponent(JSON.stringify(values)),
  };
}

export async function updateAutomation(
  id: string,
  values: AutomationUpdatePayload,
): Promise<AutomationsPayload> {
  return apiClient.request<AutomationsPayload>(
    '/api/webui/automations/update',
    { method: 'GET', query: { id }, headers: automationValuesHeader(values) },
  );
}
