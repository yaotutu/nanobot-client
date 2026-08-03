import type {
  UICliAppAttachment,
  UIImage,
  UIMcpPresetAttachment,
  UIMediaAttachment,
} from './media';

export interface UIMessageSource {
  kind: 'cron' | 'local_trigger' | 'trigger' | string;
  label?: string;
}

export interface ToolProgressEvent {
  version?: number;
  phase?: 'start' | 'end' | 'error' | string;
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
  format: 'unified' | string;
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
  phase?: 'start' | 'end' | 'error' | string;
  added: number;
  deleted: number;
  approximate?: boolean;
  status: 'editing' | 'done' | 'error';
  operation?: 'edit' | 'delete' | string;
  binary?: boolean;
  error?: string;
  pending?: boolean;
  diff?: UIFileDiff;
}

export interface AgentUIBlob {
  kind: string;
  data?: unknown;
}

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  kind?: 'message' | 'trace';
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
  turnPhase?: 'user' | 'reasoning' | 'activity' | 'answer' | 'complete';
  turnSeq?: number;
  media?: UIMediaAttachment[];
  images?: UIImage[];
}
