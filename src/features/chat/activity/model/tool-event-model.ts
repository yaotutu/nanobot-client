import {
  canonicalToolTrace,
  formatToolCallTrace,
} from '@/features/chat/tool-model/tool-traces';
import type { GenericToolStatus } from '@/features/chat/tool-model/generic-tool-model';
import i18n from '@/i18n';
import { safeActivityDetail } from '@/services/text/log-redaction';
import type { ToolProgressEvent } from '@/types/api/chat/messages';

import type { ToolEventState, ToolStatus } from './tool-types';

const TOOL_STATUS_RANK: Record<GenericToolStatus, number> = {
  running: 1,
  done: 2,
  error: 3,
};

export function toolStatusRank(status: GenericToolStatus): number {
  return TOOL_STATUS_RANK[status];
}

export function parseToolEventArguments(event: ToolProgressEvent): unknown {
  const raw = event.function?.arguments ?? event.arguments;
  if (typeof raw !== 'string') return raw ?? {};
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { args: [raw] };
  }
}

export function toolStatusFromPhase(phase: unknown): ToolStatus {
  if (phase === 'error') return 'error';
  if (phase === 'end') return 'done';
  return 'running';
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function compactEventToolName(name: string): string {
  return name.toLowerCase().split('.').pop() || name.toLowerCase();
}

export function toolEventName(event: ToolProgressEvent): string {
  return typeof event.function?.name === 'string'
    ? event.function.name
    : typeof event.name === 'string'
      ? event.name
      : '';
}

export function toolEventArguments(event: ToolProgressEvent): unknown {
  const raw = event.function?.arguments ?? event.arguments;
  if (typeof raw !== 'string') return raw;
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return raw;
  }
}

export function readableToolError(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return safeActivityDetail(value, 180);
  try {
    return safeActivityDetail(JSON.stringify(value), 180);
  } catch {
    return i18n.t('message.toolCallFailed', { defaultValue: 'Tool call failed' });
  }
}

export function toolEventStatesByTraceLine(
  events: ToolProgressEvent[],
): Map<string, ToolEventState> {
  const states = new Map<string, ToolEventState>();
  for (const event of events) {
    const line = formatToolCallTrace(event);
    if (!line) continue;
    const key = canonicalToolTrace(line);
    const status: GenericToolStatus = event.phase === 'error'
      ? 'error'
      : event.phase === 'end'
        ? 'done'
        : 'running';
    const next: ToolEventState = {
      event,
      error: status === 'error' ? readableToolError(event.error) : undefined,
      result: event.result,
      status,
    };
    const previous = states.get(key);
    if (!previous || toolStatusRank(next.status) >= toolStatusRank(previous.status)) {
      states.set(key, next);
    }
  }
  return states;
}

export function normalizeToolStatus(
  status: GenericToolStatus,
  turnActive: boolean,
): ToolStatus {
  return status === 'running' && !turnActive ? 'done' : status;
}

export function isMcpToolName(name: string): boolean {
  const compact = name.toLowerCase();
  return compact.startsWith('mcp_')
    || compact.startsWith('mcp.')
    || compact.includes('mcp__')
    || /^(browser|page|playwright)[_.-]/.test(compact);
}
