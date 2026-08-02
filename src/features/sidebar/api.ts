import { apiClient } from '@/services/api/api';
import type { AutomationsPayload } from '@/types/api/automations';
import type { SessionDeleteResult } from '@/types/api/chat';
import type {
  ChatSummary,
  SidebarStatePayload,
} from '@/types/api/sidebar';

interface SessionRow {
  key: string;
  created_at: string | null;
  updated_at: string | null;
  title?: string;
  preview?: string;
  model_preset?: string | null;
  run_started_at?: number | null;
  workspace_scope?: import('@/types/api/workspaces').WorkspaceScopePayload | null;
}

function splitKey(key: string): { channel: string; chatId: string } {
  const sep = key.indexOf(':');
  return sep < 0 ? { channel: '', chatId: key } : { channel: key.slice(0, sep), chatId: key.slice(sep + 1) };
}

export async function listSessions(): Promise<ChatSummary[]> {
  const body = await apiClient.get<{ sessions: SessionRow[] }>('/api/sessions');
  return body.sessions.map((s) => ({
    key: s.key,
    ...splitKey(s.key),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    title: s.title ?? '',
    preview: s.preview ?? '',
    modelPreset: s.model_preset ?? null,
    runStartedAt: s.run_started_at ?? null,
    workspaceScope: s.workspace_scope ?? null,
  }));
}

export async function fetchSidebarState(): Promise<SidebarStatePayload> {
  return apiClient.get<SidebarStatePayload>('/api/webui/sidebar-state');
}

export async function updateSidebarState(state: SidebarStatePayload): Promise<SidebarStatePayload> {
  return apiClient.request<SidebarStatePayload>(
    '/api/webui/sidebar-state/update',
    { method: 'GET', query: { state: JSON.stringify(state) } },
  );
}

export async function deleteSession(
  key: string,
  options?: { deleteAutomations?: boolean },
): Promise<SessionDeleteResult> {
  const query: Record<string, string> = {};
  if (options?.deleteAutomations) query.delete_automations = 'true';
  return apiClient.request<SessionDeleteResult>(
    `/api/sessions/${encodeURIComponent(key)}/delete`,
    { method: 'GET', query },
  );
}

export async function fetchSessionAutomations(key: string): Promise<AutomationsPayload> {
  return apiClient.get<AutomationsPayload>(
    `/api/sessions/${encodeURIComponent(key)}/automations`,
  );
}
