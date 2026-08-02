import type {
  InboundEvent,
  OutboundMedia,
  StreamError,
  UICliAppAttachment,
  UIMcpPresetAttachment,
} from '@/types/api/chat';
import type { ConnectionStatus } from '@/types/api/runtime';
import type { WorkspaceScopePayload } from '@/types/api/workspaces';

export type StatusListener = (status: ConnectionStatus) => void;
export type EventListener = (event: InboundEvent) => void;
export type RunStatusListener = (chatId: string, startedAt: number | null) => void;
export type TransportErrorListener = (error: StreamError) => void;
export type Reauthenticate = () => Promise<string | null>;

export type OutboundFrame =
  | { type: 'new_chat'; workspace_scope?: WorkspaceScopePayload }
  | { type: 'fork_chat'; source_chat_id: string; before_user_index: number; title?: string }
  | { type: 'attach'; chat_id: string }
  | { type: 'set_workspace_scope'; chat_id: string; workspace_scope: WorkspaceScopePayload }
  | {
      type: 'message';
      chat_id: string;
      content: string;
      media?: OutboundMedia[];
      cli_apps?: UICliAppAttachment[];
      mcp_presets?: UIMcpPresetAttachment[];
      quoted_context?: string;
      workspace_scope?: WorkspaceScopePayload;
      turn_id: string;
      webui: true;
    }
  | { type: 'transcribe_audio'; request_id: string; data_url: string; duration_ms?: number };

export interface MessageSendResult {
  turnId: string;
  accepted: Promise<void>;
}

export interface NanobotSocketOptions {
  url: string;
  reauthenticate: Reauthenticate;
  maxFrameBytes?: number;
}

export const SYSTEM_COMMAND_TURN_PREFIX = 'webui-system:';

export function createTurnId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function eventTurnId(event: InboundEvent): string | null {
  return 'turn_id' in event && typeof event.turn_id === 'string' ? event.turn_id : null;
}

export function isSystemCommandTurnId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(SYSTEM_COMMAND_TURN_PREFIX);
}

export function parseInboundEvent(data: unknown): InboundEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { event?: unknown }).event !== 'string') return null;
    return parsed as InboundEvent;
  } catch {
    return null;
  }
}

export function normalizeMaxFrameBytes(value?: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function frameFitsTransport(frame: OutboundFrame, maxFrameBytes?: number): boolean {
  return !maxFrameBytes || JSON.stringify(frame).length <= maxFrameBytes;
}
