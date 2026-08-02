import type { SessionAutomationJob } from './automations';
import type { GoalStateWsPayload } from './runtime';
import type { WorkspaceScopePayload } from './workspaces';

export interface OutboundMedia {
  data_url: string;
  name?: string;
}

export interface UIImage {
  url?: string;
  name?: string;
}

export interface UIMediaAttachment {
  kind: "image" | "video" | "file";
  url?: string;
  name?: string;
}

export interface UICliAppAttachment {
  name: string;
  display_name?: string;
  category?: string;
  entry_point?: string;
  logo_url?: string | null;
  brand_color?: string | null;
}

export interface UIMcpPresetAttachment {
  name: string;
  display_name?: string;
  category?: string;
  transport?: string;
  status?: string;
  configured?: boolean;
  logo_url?: string | null;
  brand_color?: string | null;
}

export interface UIMessageSource {
  kind: "cron" | "local_trigger" | "trigger" | string;
  label?: string;
}

export interface SendAttachment {
  media: OutboundMedia;
  preview: UIMediaAttachment;
}

export type SlashCommandLifecycle =
  | "side_channel"
  | "finalize_active_turn"
  | "stop_active_turn"
  | "agent_turn"
  | "agent_turn_with_args";

export interface SlashCommand {
  command: string;
  title: string;
  description: string;
  icon: string;
  argHint: string;
  lifecycle: SlashCommandLifecycle;
  acceptsArgs: boolean;
}

export interface SendMessageOptions {
  cliApps?: UICliAppAttachment[];
  mcpPresets?: UIMcpPresetAttachment[];
  quotedContext?: string;
  workspaceScope?: WorkspaceScopePayload | null;
  sideChannel?: boolean;
  finalizeActiveTurn?: boolean;
  continueActiveTurn?: boolean;
}

export type StreamError =
  | { kind: "message_too_big"; chatId?: string; turnId?: string }
  | {
      kind: "workspace_scope_rejected";
      reason?: string;
      chatId?: string;
      turnId?: string;
    }
  | {
      kind: "turn_rejected";
      detail?: string;
      reason?: string;
      chatId: string;
      turnId: string;
    };

export type AttachmentStatus = "encoding" | "ready" | "error";

export interface ComposerAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  uri: string;
  mime: string;
  size: number;
  status: AttachmentStatus;
  dataUrl?: string;
  encodedBytes?: number;
  error?: string;
}

export interface ToolProgressEvent {
  version?: number;
  phase?: "start" | "end" | "error" | string;
  call_id?: string;
  name?: string;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
  files?: unknown[];
  embeds?: unknown[];
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
}

export interface UIFileDiff {
  format: "unified" | string;
  context?: number;
  truncated?: boolean;
  text?: string;
}

export interface UIFileEdit {
  version?: number;
  call_id: string;
  tool: string;
  path: string;
  absolute_path?: string;
  phase?: "start" | "end" | "error" | string;
  added: number;
  deleted: number;
  approximate?: boolean;
  status: "editing" | "done" | "error";
  operation?: "edit" | "delete" | string;
  binary?: boolean;
  error?: string;
  pending?: boolean;
  diff?: UIFileDiff;
}

export interface FilePreviewPayload {
  path: string;
  display_path: string;
  project_path: string;
  language: string;
  content: string;
  size: number;
  truncated: boolean;
}

export interface AgentUIBlob {
  kind: string;
  data?: unknown;
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  kind?: "message" | "trace";
  isStreaming?: boolean;
  createdAt: number;
  traces?: string[];
  toolEvents?: ToolProgressEvent[];
  fileEdits?: UIFileEdit[];
  activitySegmentId?: string;
  reasoning?: string;
  reasoningStreaming?: boolean;
  latencyMs?: number;
  completedAt?: number;
  source?: UIMessageSource;
  cliApps?: UICliAppAttachment[];
  mcpPresets?: UIMcpPresetAttachment[];
  turnId?: string;
  turnPhase?: "user" | "reasoning" | "activity" | "answer" | "complete";
  turnSeq?: number;
  media?: UIMediaAttachment[];
  images?: UIImage[];
}

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
  direction?: "latest";
  before?: string | null;
}

export interface SessionDeleteResult {
  deleted: boolean;
  blocked_by_automations?: boolean;
  automations?: SessionAutomationJob[];
}

export type InboundEvent =
  | { event: "ready"; chat_id: string; client_id: string }
  | { event: "attached"; chat_id: string }
  | { event: "message_accepted"; chat_id: string; turn_id: string }
  | {
      event: "message";
      chat_id: string;
      text: string;
      kind?: "tool_hint" | "progress" | "reasoning";
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
      event: "file_edit";
      chat_id: string;
      edits: UIFileEdit[];
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: "delta";
      chat_id: string;
      text: string;
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: "reasoning_delta";
      chat_id: string;
      text: string;
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: "reasoning_end";
      chat_id: string;
      stream_id?: string;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
    }
  | {
      event: "stream_end";
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
      event: "turn_end";
      chat_id: string;
      latency_ms?: number;
      turn_id?: string;
      turn_phase?: string;
      turn_seq?: number;
      goal_state?: GoalStateWsPayload;
    }
  | {
      event: "goal_status";
      chat_id: string;
      status: "running" | "idle";
      started_at?: number;
      turn_id?: string;
    }
  | {
      event: "session_updated";
      chat_id: string;
      scope?: string;
      workspace_scope?: WorkspaceScopePayload;
    }
  | { event: "transcription_result"; request_id: string; text: string }
  | {
      event: "transcription_error";
      request_id?: string;
      detail?: string;
      provider?: string;
    }
  | {
      event: "runtime_model_updated";
      model_name: string;
      model_preset?: string | null;
    }
  | { event: "turn_model_updated"; chat_id: string; model_name: string }
  | { event: "goal_state"; chat_id: string; goal_state: GoalStateWsPayload }
  | {
      event: "error";
      chat_id?: string;
      detail?: string;
      reason?: string;
      turn_id?: string;
    };

