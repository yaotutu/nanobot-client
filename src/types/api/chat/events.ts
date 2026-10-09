import type { GoalStateWsPayload } from '../runtime';
import type { SidebarStatePayload } from '../sidebar';
import type { WorkspaceScopePayload } from '../workspaces';
import type {
  AgentUIBlob,
  ToolProgressEvent,
  UIFileEdit,
  UIMessageSource,
} from './messages';
import type { UICliAppAttachment, UIMcpPresetAttachment } from './media';

export type InboundEvent = (
  | {
      event: 'user_message';
      chat_id: string;
      text: string;
      starts_turn?: boolean;
      media_urls?: Array<{ url: string; name?: string }>;
      cli_apps?: UICliAppAttachment[];
      mcp_presets?: UIMcpPresetAttachment[];
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | { event: 'ready'; chat_id: string; client_id: string }
  | { event: 'attached'; chat_id: string }
  | { event: 'message_accepted'; chat_id: string; turn_id: string }
  | {
      event: 'message';
      chat_id: string;
      text: string;
      kind?: 'tool_hint' | 'progress' | 'reasoning';
      media?: string[];
      media_urls?: Array<{ url: string; name?: string }>;
      tool_events?: ToolProgressEvent[];
      latency_ms?: number;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
      reply_to?: string;
      source?: UIMessageSource;
      agent_ui?: AgentUIBlob;
    }
  | {
      event: 'file_edit';
      chat_id: string;
      edits: UIFileEdit[];
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: 'delta';
      chat_id: string;
      text: string;
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: 'reasoning_delta';
      chat_id: string;
      text: string;
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: 'reasoning_end';
      chat_id: string;
      text?: string;
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: 'stream_end';
      chat_id: string;
      source?: UIMessageSource;
      stream_id?: string;
      text?: string;
      resuming?: boolean;
      merge_next?: boolean;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: 'turn_end';
      chat_id: string;
      latency_ms?: number;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
      goal_state?: GoalStateWsPayload;
    }
  | {
      event: 'goal_status';
      chat_id: string;
      status: 'running' | 'idle';
      started_at?: number;
      turn_id?: string;
    }
  | {
      event: 'session_updated';
      chat_id: string;
      scope?: string;
      workspace_scope?: WorkspaceScopePayload;
    }
  | {
      event: 'webui_response';
      request_id: string;
      ok: boolean;
      result?: unknown;
      error?: { status?: number; message?: string };
    }
  | {
      event: 'sidebar_state_updated';
      state: SidebarStatePayload;
    }
  | { event: 'transcription_result'; request_id: string; text: string }
  | {
      event: 'transcription_error';
      request_id?: string;
      detail?: string;
      provider?: string;
    }
  | {
      event: 'runtime_model_updated';
      model_name: string;
      model_preset?: string | null;
    }
  | { event: 'turn_model_updated'; chat_id: string; model_name: string }
  | { event: 'goal_state'; chat_id: string; goal_state: GoalStateWsPayload }
  | {
      event: 'error';
      chat_id?: string;
      detail?: string;
      reason?: string;
      turn_id?: string;
    }
) & {
  /** 服务端持久化事件的稳定标识和时间；实时事件不要求携带。 */
  projection_id?: string;
  created_at_ms?: number;
};
