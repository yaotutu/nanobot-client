import { apiClient } from '@/services/api/api';
import type { SessionDeleteResult } from '@/types/api/chat/thread';
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

/**
 * Sidebar mutation 需要复用外部 WebUI 的已认证 WebSocket，而不是 direct HTTP。
 * 页面层只需要通过这个小型接口注入当前 socket，store 仍然只面向 API 模块，避免 UI 与连接层耦合。
 */
interface SidebarMutationTransport {
  updateSidebarState(state: SidebarStatePayload): Promise<SidebarStatePayload>;
  deleteSession(key: string): Promise<SessionDeleteResult>;
}

let getSidebarMutationTransport: (() => SidebarMutationTransport | null) | null = null;

/** 给 sidebar API 注入当前 WebSocket transport；卸载时传 null 清理引用。 */
export function configureSidebarMutationTransport(
  provider: (() => SidebarMutationTransport | null) | null,
): void {
  getSidebarMutationTransport = provider;
}

function requireSidebarMutationTransport(): SidebarMutationTransport {
  const transport = getSidebarMutationTransport?.();
  if (!transport) throw new Error('sidebar_mutation_transport_unavailable');
  return transport;
}

export async function updateSidebarState(state: SidebarStatePayload): Promise<SidebarStatePayload> {
  return requireSidebarMutationTransport().updateSidebarState(state);
}

export async function deleteSession(
  key: string,
): Promise<SessionDeleteResult> {
  return requireSidebarMutationTransport().deleteSession(key);
}
