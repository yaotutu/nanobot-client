import {
  canonicalToolTrace,
  formatToolCallTrace,
} from '@/features/chat/tool-model/tool-traces';
import type { ToolProgressEvent } from '@/types/api/chat/messages';

import {
  parseToolEventArguments,
  readableToolError,
  safeJson,
  toolEventName,
  toolStatusFromPhase,
  toolStatusRank,
} from './tool-event-model';
import type { CliRunSummary, McpRunSummary, ToolStatus } from './tool-types';

const CLI_RUN_TOOL_NAMES = new Set(['run_cli_app', 'cli_anything_run']);
const MCP_TOOL_NAME_RE = /^mcp_([a-z0-9_-]+?)_(.+)$/i;

export function parseCliRunTrace(
  line: string,
  status: ToolStatus,
): CliRunSummary | null {
  const match = /^(run_cli_app|cli_anything_run)\((.*)\)$/.exec(line.trim());
  if (!match) return null;
  const argsText = match[2].trim();
  if (!argsText) return cliRunFromArguments({}, { key: line, status });
  try {
    return cliRunFromArguments(JSON.parse(argsText), { key: line, status });
  } catch {
    return cliRunFromArguments({ args: [argsText] }, { key: line, status });
  }
}

export function cliRunFromEvent(event: ToolProgressEvent): CliRunSummary | null {
  const name = toolEventName(event);
  if (!CLI_RUN_TOOL_NAMES.has(name)) return null;
  const args = parseToolEventArguments(event);
  return cliRunFromArguments(args, {
    key: event.call_id ? `call:${event.call_id}` : `${name}:${safeJson(args)}`,
    status: toolStatusFromPhase(event.phase),
    error: readableToolError(event.error),
  });
}

export function cliRunMapByTraceLine(
  events: ToolProgressEvent[],
): Map<string, CliRunSummary> {
  const runs = new Map<string, CliRunSummary>();
  for (const event of events) {
    const run = cliRunFromEvent(event);
    if (!run) continue;
    const line = formatToolCallTrace(event);
    if (!line) continue;
    const key = canonicalToolTrace(line);
    runs.set(key, mergeCliRun(runs.get(key), run));
  }
  return runs;
}

export function mergeCliRun(
  existing: CliRunSummary | undefined,
  incoming: CliRunSummary,
): CliRunSummary {
  if (!existing) return incoming;
  return toolStatusRank(incoming.status) >= toolStatusRank(existing.status)
    ? { ...existing, ...incoming }
    : existing;
}

export function cliRunFromArguments(
  value: unknown,
  options: { key: string; status: ToolStatus; error?: string },
): CliRunSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { name: 'cli', args: [], json: false, ...options };
  }
  const record = value as Record<string, unknown>;
  return {
    key: options.key,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'cli',
    args: Array.isArray(record.args)
      ? record.args.filter((item): item is string => typeof item === 'string')
      : [],
    json: record.json === true || record.json === 'true',
    workingDir: typeof record.working_dir === 'string' ? record.working_dir : undefined,
    status: options.status,
    error: options.error,
  };
}

export function parseMcpRunTrace(
  line: string,
  status: ToolStatus,
): McpRunSummary | null {
  const match = /^([a-z0-9_-]+)\((.*)\)$/i.exec(line.trim());
  if (!match || !MCP_TOOL_NAME_RE.test(match[1])) return null;
  const raw = match[2].trim();
  let args: unknown = {};
  if (raw) {
    try {
      args = JSON.parse(raw);
    } catch {
      args = raw;
    }
  }
  return mcpRunFromToolName(match[1], args, { key: line, status });
}

export function mcpRunFromEvent(event: ToolProgressEvent): McpRunSummary | null {
  const name = toolEventName(event);
  if (!MCP_TOOL_NAME_RE.test(name)) return null;
  const args = parseToolEventArguments(event);
  return mcpRunFromToolName(name, args, {
    key: event.call_id ? `call:${event.call_id}` : `${name}:${safeJson(args)}`,
    status: toolStatusFromPhase(event.phase),
    error: readableToolError(event.error),
  });
}

export function mcpRunMapByTraceLine(
  events: ToolProgressEvent[],
): Map<string, McpRunSummary> {
  const runs = new Map<string, McpRunSummary>();
  for (const event of events) {
    const run = mcpRunFromEvent(event);
    if (!run) continue;
    const line = formatToolCallTrace(event);
    if (!line) continue;
    const key = canonicalToolTrace(line);
    runs.set(key, mergeMcpRun(runs.get(key), run));
  }
  return runs;
}

export function mergeMcpRun(
  existing: McpRunSummary | undefined,
  incoming: McpRunSummary,
): McpRunSummary {
  if (!existing) return incoming;
  return toolStatusRank(incoming.status) >= toolStatusRank(existing.status)
    ? { ...existing, ...incoming }
    : existing;
}

export function mcpRunFromToolName(
  toolName: string,
  args: unknown,
  options: { key: string; status: ToolStatus; error?: string },
): McpRunSummary | null {
  const match = MCP_TOOL_NAME_RE.exec(toolName);
  if (!match) return null;
  const presetName = match[1].toLowerCase();
  return {
    key: options.key,
    presetName,
    displayName: titleFromCapabilityName(presetName),
    toolName: match[2],
    args,
    status: options.status,
    error: options.error,
  };
}

export function titleFromCapabilityName(name: string): string {
  const overrides: Record<string, string> = {
    github: 'GitHub',
    gitlab: 'GitLab',
    openai: 'OpenAI',
  };
  return overrides[name.toLowerCase()] || name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || name;
}

export function capabilityInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || value.slice(0, 2).toUpperCase();
}

export function displayCliArg(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

export function formatCliArgs(run: CliRunSummary): string {
  return [...(run.json ? ['--json'] : []), ...run.args].map(displayCliArg).join(' ');
}
