import type { GenericToolStatus } from '@/features/chat/tool-model/generic-tool-model';
import type { RenderableFileDiffHunk } from '@/services/text/file-diff';
import type { ToolProgressEvent, UIFileEdit } from '@/types/api/chat';

export type ToolStatus = 'running' | 'done' | 'error';

export interface CapabilityBrand {
  color: string;
  fallback: 'server' | 'terminal';
  initials?: string;
  logoUrls?: string[];
}

export interface ToolRowModel {
  brand?: CapabilityBrand;
  key: string;
  label: string;
  detail?: string;
  icon?: 'clock' | 'file-search' | 'folder' | 'list' | 'memory' | 'play' | 'search' | 'server' | 'web' | 'tool';
  status: ToolStatus;
  url?: string;
  webHost?: string;
}

export interface FileEditSummary {
  key: string;
  path: string;
  absolutePath?: string;
  added: number;
  deleted: number;
  approximate: boolean;
  binary: boolean;
  status: UIFileEdit['status'];
  operation?: UIFileEdit['operation'];
  pending: boolean;
  error?: string;
  diff?: UIFileEdit['diff'];
}

export interface VisibleDiffHunk {
  hunk: RenderableFileDiffHunk;
  skippedBefore: number;
}

export interface ToolEventState {
  event: ToolProgressEvent;
  error?: string;
  result?: unknown;
  status: GenericToolStatus;
}

export interface CliRunSummary {
  key: string;
  name: string;
  args: string[];
  json: boolean;
  workingDir?: string;
  status: ToolStatus;
  error?: string;
}

export interface McpRunSummary {
  key: string;
  presetName: string;
  displayName: string;
  toolName: string;
  args: unknown;
  status: ToolStatus;
  error?: string;
}
