import type { WorkspaceScopePayload } from '../workspaces';
import type { InboundEvent } from './events';

export interface WebuiThreadPersistedPayload {
  schemaVersion: 3;
  projection: 'events';
  sessionKey?: string;
  events: Array<InboundEvent & { projection_id: string }>;
  fork_boundary_event_index?: number;
  /** Turn ids backed by an explicit persisted turn_end event. */
  completed_turn_ids?: string[];
  /** 服务端提供的活动状态，不再从旧历史消息格式推断。 */
  has_pending_tool_calls?: boolean;
  active_turn_id?: string | null;
  page?: {
    before_cursor?: string | null;
    has_more_before?: boolean;
    loaded_event_count?: number;
    total_known_event_count?: number;
    user_message_offset?: number;
  };
  workspace_scope?: WorkspaceScopePayload;
}

export interface FetchThreadOptions {
  limit?: number;
  direction?: 'latest';
  before?: string | null;
}

export interface SessionDeleteResult {
  deleted: boolean;
  blocked_by_automations?: boolean;
  automations?: unknown[];
}
