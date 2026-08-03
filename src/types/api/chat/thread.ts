import type { SessionAutomationJob } from '../automations';
import type { WorkspaceScopePayload } from '../workspaces';
import type { UIMessage } from './messages';

export interface WebuiThreadPersistedPayload {
  schemaVersion: number;
  sessionKey?: string;
  savedAt?: string;
  messages: UIMessage[];
  fork_boundary_message_count?: number;
  /** Turn ids backed by an explicit persisted turn_end event. */
  completed_turn_ids?: string[];
  /** Server-authored activity state; absent on older gateways. */
  has_pending_tool_calls?: boolean;
  active_turn_id?: string | null;
  page?: {
    before_cursor?: string | null;
    has_more_before?: boolean;
    loaded_message_count?: number;
    total_known_message_count?: number;
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
  automations?: SessionAutomationJob[];
}
