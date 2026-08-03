import type { GoalStateWsPayload } from '../runtime';
import type { WorkspaceScopePayload } from '../workspaces';
import type {
  AgentUIBlob,
  ToolProgressEvent,
  UIFileEdit,
  UIMessageSource,
} from './messages';

export type InboundEvent =
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
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: 'stream_end';
      chat_id: string;
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
    };
