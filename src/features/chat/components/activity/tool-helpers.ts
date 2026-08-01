import {
  canonicalToolTrace,
  formatToolCallTrace,
} from '@/features/chat/tool-traces';
import {
  canGroupGenericToolRuns,
  describeGenericToolRun,
  parseGenericToolTrace,
  type GenericToolRunItem,
  type GenericToolStatus,
} from '@/features/chat/generic-tool-model';
import { describeMcpActivity } from '@/features/chat/mcp-activity-model';
import { describeTraceLine } from '@/features/chat/trace-activity-model';
import {
  presentWebSearchAction,
  webSearchRunsByTraceLine,
} from '@/features/chat/web-search-model';
import i18n from '@/i18n';
import {
  countSkippedUnchangedLines,
  type RenderableFileDiff,
  type RenderableFileDiffHunk,
} from '@/services/text/file-diff';
import {
  compactActivityPath,
  redactActivityText,
  redactShellCommand,
  safeActivityDetail,
} from '@/services/text/log-redaction';
import { logoFallbackUrls } from '@/services/links/provider-brand';
import type { Palette } from '@/ui/palette';
import type {
  CliAppInfo,
  McpPresetInfo,
  ToolProgressEvent,
  UIFileEdit,
  UIMessage,
} from '@/types/api';

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

const FILE_EDIT_TOOL_NAMES = new Set(['write_file', 'edit_file', 'apply_patch']);

const TOOL_STATUS_RANK: Record<GenericToolStatus, number> = {
  running: 1,
  done: 2,
  error: 3,
};

const CLI_RUN_TOOL_NAMES = new Set(['run_cli_app', 'cli_anything_run']);
const MCP_TOOL_NAME_RE = /^mcp_([a-z0-9_-]+?)_(.+)$/i;

const fileDiffObjectIds = new WeakMap<object, number>();
let nextFileDiffObjectId = 1;

export function fileDiffObjectId(diff: UIFileEdit['diff']): number {
  if (!diff) return 0;
  const existing = fileDiffObjectIds.get(diff);
  if (existing) return existing;
  const id = nextFileDiffObjectId;
  nextFileDiffObjectId += 1;
  fileDiffObjectIds.set(diff, id);
  return id;
}

export function fileDiffRevision(diff: UIFileEdit['diff']): string {
  if (!diff) return 'none';
  const text = diff.text ?? '';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${fileDiffObjectId(diff)}:${text.length}:${hash >>> 0}:${diff.truncated ? 1 : 0}`;
}

export function selectVisibleDiffLines(
  diff: RenderableFileDiff,
  lineLimit: number,
): VisibleDiffHunk[] {
  let remaining = Math.max(0, lineLimit);
  const visible: VisibleDiffHunk[] = [];
  let previous: RenderableFileDiffHunk | null = null;
  for (const hunk of diff.hunks) {
    if (remaining <= 0) break;
    const skippedBefore = previous ? countSkippedUnchangedLines(previous, hunk) : 0;
    const lines = hunk.lines.slice(0, remaining);
    visible.push({ hunk: { ...hunk, lines }, skippedBefore });
    remaining -= lines.length;
    previous = hunk;
  }
  return visible;
}

export function parseCliRunTrace(line: string, status: ToolStatus): CliRunSummary | null {
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

export function cliRunMapByTraceLine(events: ToolProgressEvent[]): Map<string, CliRunSummary> {
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
  return TOOL_STATUS_RANK[incoming.status] >= TOOL_STATUS_RANK[existing.status]
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

export function parseMcpRunTrace(line: string, status: ToolStatus): McpRunSummary | null {
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

export function mcpRunMapByTraceLine(events: ToolProgressEvent[]): Map<string, McpRunSummary> {
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
  return TOOL_STATUS_RANK[incoming.status] >= TOOL_STATUS_RANK[existing.status]
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

export function toolRows(
  message: UIMessage,
  active: boolean,
  cliAppsByName: Map<string, CliAppInfo>,
  mcpPresetsByName: Map<string, McpPresetInfo>,
): ToolRowModel[] {
  const edits = message.fileEdits ?? [];
  const coveredCalls = new Set(edits.map((edit) => edit.call_id).filter(Boolean));
  const events = (message.toolEvents ?? []).filter((event) => {
    const name = compactEventToolName(toolEventName(event));
    return !(FILE_EDIT_TOOL_NAMES.has(name) && event.call_id && coveredCalls.has(event.call_id));
  });
  const webRunsByLine = webSearchRunsByTraceLine(events);
  const cliRunsByLine = cliRunMapByTraceLine(events);
  const mcpRunsByLine = mcpRunMapByTraceLine(events);
  const statesByLine = toolEventStatesByTraceLine(events);
  const renderedRunKeys = new Set<string>();
  const rows: ToolRowModel[] = [];
  let genericItems: GenericToolRunItem[] = [];
  let genericGroupIndex = 0;

  const flushGenericItems = () => {
    if (!genericItems.length) return;
    const presentation = describeGenericToolRun(genericItems);
    const status = normalizeToolStatus(presentation.status, active);
    const action = [presentation.label, presentation.detail].filter(Boolean).join(' ');
    rows.push({
      key: `generic:${genericItems[0].trace.groupKey}:${genericGroupIndex}`,
      label: presentation.aside ? `${action} · ${presentation.aside}` : action,
      icon: presentation.status === 'error' ? 'tool' : genericToolIcon(genericItems[0].trace.family),
      status,
    });
    genericItems = [];
    genericGroupIndex += 1;
  };

  const appendWebRun = (run: ReturnType<typeof webRunsByLine.get>, suffix: string) => {
    if (!run || renderedRunKeys.has(run.key)) return;
    flushGenericItems();
    renderedRunKeys.add(run.key);
    const status = normalizeToolStatus(run.status, active);
    rows.push({
      key: `web-search:${run.key}:${suffix}`,
      label: presentWebSearchAction(run.query, status, run.target),
      icon: 'search',
      status,
    });
    run.sources.forEach((source, index) => {
      rows.push({
        key: `web-source:${run.key}:${index}:${source.href}`,
        label: source.title,
        detail: source.displayUrl,
        icon: 'web',
        status: 'done',
        url: source.href,
        webHost: source.host,
      });
    });
  };

  const appendCliRun = (run: CliRunSummary, suffix: string) => {
    if (renderedRunKeys.has(run.key)) return;
    flushGenericItems();
    renderedRunKeys.add(run.key);
    const runStatus = normalizeToolStatus(run.status, active);
    const app = cliAppsByName.get(run.name.toLowerCase());
    const displayName = app?.display_name || titleFromCapabilityName(run.name);
    const action = runStatus === 'error'
      ? i18n.t('message.cliRunFailed')
      : runStatus === 'running'
        ? i18n.t('message.cliRunRunning')
        : i18n.t('message.cliRunRan');
    const args = safeActivityDetail(
      compactActivityPath(redactShellCommand(formatCliArgs(run))),
      120,
    );
    rows.push({
      key: `cli:${run.key}:${suffix}`,
      label: `${action} ${displayName}${args ? ` · ${args}` : ''}`,
      brand: {
        color: runStatus === 'error' ? '#DC2626' : app?.brand_color || '#0891B2',
        fallback: 'terminal',
        initials: app ? capabilityInitials(app.display_name || app.name) : undefined,
        logoUrls: logoFallbackUrls(app?.logo_url),
      },
      status: runStatus,
    });
  };

  const appendMcpRun = (run: McpRunSummary, suffix: string) => {
    if (renderedRunKeys.has(run.key)) return;
    flushGenericItems();
    renderedRunKeys.add(run.key);
    const runStatus = normalizeToolStatus(run.status, active);
    const preset = mcpPresetsByName.get(run.presetName.toLowerCase());
    const displayName = preset?.display_name || run.displayName;
    const activity = describeMcpActivity(run.toolName, run.args, runStatus);
    rows.push({
      key: `mcp:${run.key}:${suffix}`,
      label: `${activity.action}${activity.target ? ` ${activity.target}` : ''} · ${displayName}`,
      brand: {
        color: runStatus === 'error' ? '#DC2626' : preset?.brand_color || '#6D5DF6',
        fallback: 'server',
        initials: preset
          ? capabilityInitials(preset.display_name || preset.name)
          : undefined,
        logoUrls: logoFallbackUrls(preset?.logo_url),
      },
      status: runStatus,
    });
  };

  const lines = traceLines(message);
  lines.forEach((line, index) => {
    const traceKey = canonicalToolTrace(line);
    const state = statesByLine.get(traceKey);
    const fallback: GenericToolStatus = active && index === lines.length - 1 ? 'running' : 'done';
    const status = normalizeToolStatus(state?.status ?? fallback, active);

    const webRun = webRunsByLine.get(traceKey);
    if (webRun) {
      appendWebRun(webRun, String(index));
      return;
    }

    const cliRun = cliRunsByLine.get(traceKey) ?? parseCliRunTrace(line, status);
    if (cliRun) {
      appendCliRun(cliRun, String(index));
      return;
    }

    const mcpRun = mcpRunsByLine.get(traceKey) ?? parseMcpRunTrace(line, status);
    if (mcpRun) {
      appendMcpRun(mcpRun, String(index));
      return;
    }

    const genericTrace = parseGenericToolTrace(line);
    if (genericTrace) {
      const item: GenericToolRunItem = {
        trace: genericTrace,
        status,
        error: state?.error,
      };
      const previous = genericItems[genericItems.length - 1];
      if (previous && !canGroupGenericToolRuns(previous, item)) flushGenericItems();
      genericItems.push(item);
      return;
    }

    flushGenericItems();
    const eventName = state ? toolEventName(state.event) : '';
    if (state && isMcpToolName(eventName)) {
      const activity = describeMcpActivity(eventName, toolEventArguments(state.event), status);
      rows.push({
        key: `mcp:${state.event.call_id || traceKey}:${index}`,
        label: activity.action,
        detail: [activity.target, state.error].filter(Boolean).join(' · ') || undefined,
        icon: 'server',
        status,
      });
      return;
    }

    const trace = describeTraceLine(line, status, state?.result);
    rows.push({
      key: `trace:${index}:${traceKey}`,
      label: trace.url
        ? trace.label
        : [trace.label, trace.detail].filter(Boolean).join(' '),
      detail: trace.url
        ? [trace.detail, state?.error].filter(Boolean).join(' · ') || undefined
        : state?.error,
      icon: trace.icon === 'clock'
        ? 'clock'
        : trace.kind === 'search'
          ? 'search'
          : trace.url
            ? 'web'
            : 'tool',
      status,
      url: trace.url,
    });
  });
  flushGenericItems();

  for (const run of webRunsByLine.values()) appendWebRun(run, 'event');
  for (const run of cliRunsByLine.values()) appendCliRun(run, 'event');
  for (const run of mcpRunsByLine.values()) appendMcpRun(run, 'event');
  flushGenericItems();

  return rows;
}

export function toolEventStatesByTraceLine(events: ToolProgressEvent[]): Map<string, ToolEventState> {
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
    if (!previous || TOOL_STATUS_RANK[next.status] >= TOOL_STATUS_RANK[previous.status]) {
      states.set(key, next);
    }
  }
  return states;
}

export function normalizeToolStatus(status: GenericToolStatus, turnActive: boolean): ToolStatus {
  return status === 'running' && !turnActive ? 'done' : status;
}

export function genericToolIcon(family: GenericToolRunItem['trace']['family']): ToolRowModel['icon'] {
  if (family === 'content-search' || family === 'file-search') return 'file-search';
  if (family === 'list') return 'list';
  if (family === 'read') return 'folder';
  if (family === 'memory') return 'memory';
  return 'play';
}

export function isMcpToolName(name: string): boolean {
  const compact = name.toLowerCase();
  return compact.startsWith('mcp_')
    || compact.startsWith('mcp.')
    || compact.includes('mcp__')
    || /^(browser|page|playwright)[_.-]/.test(compact);
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

export function compactReasoningPreview(value: string): string {
  return redactActivityText(value)
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_#`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function traceLines(message: UIMessage): string[] {
  if (message.traces?.length) return message.traces.filter((line) => line.trim());
  return message.content.trim() ? [message.content] : [];
}

export function collectFileEdits(messages: UIMessage[]): UIFileEdit[] {
  const edits: UIFileEdit[] = [];
  for (const message of messages) {
    if (message.kind === 'trace' && message.fileEdits?.length) edits.push(...message.fileEdits);
  }
  return edits;
}

function fileEditCallKey(edit: UIFileEdit): string {
  if (edit.call_id && edit.path) return `${edit.call_id}|${edit.tool}|${edit.path}`;
  if (edit.call_id) return `${edit.call_id}|${edit.tool}`;
  return `${edit.tool}|${edit.path}`;
}

function latestFileEditEvents(edits: UIFileEdit[]): UIFileEdit[] {
  const order: string[] = [];
  const byKey = new Map<string, UIFileEdit>();
  for (const edit of edits) {
    const key = fileEditCallKey(edit);
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, edit);
  }
  return order.flatMap((key) => {
    const edit = byKey.get(key);
    return edit ? [edit] : [];
  });
}

export function summarizeFileEdits(edits: UIFileEdit[], active: boolean): FileEditSummary[] {
  return latestFileEditEvents(edits).flatMap((edit) => {
    const editing = active && edit.status === 'editing';
    const failed = edit.status === 'error';
    if (!edit.path && edit.pending && !editing) return [];
    if (!edit.path && !editing && !failed) return [];

    const binary = Boolean(edit.binary);
    return [{
      key: fileEditCallKey(edit),
      path: edit.path || '',
      absolutePath: edit.absolute_path,
      added: binary ? 0 : edit.added,
      deleted: binary ? 0 : edit.deleted,
      approximate: active && Boolean(edit.approximate),
      binary,
      status: editing ? 'editing' : failed ? 'error' : 'done',
      operation: edit.operation,
      pending: Boolean(edit.pending) && !edit.path,
      error: edit.error,
      diff: edit.diff,
    }];
  });
}

function isFileEditTraceLine(line: string): boolean {
  return /^(write_file|edit_file|apply_patch)\(/.test(line.trim());
}

export function messageHasOnlyFileActivity(message: UIMessage): boolean {
  if (message.kind !== 'trace' || !message.fileEdits?.length) return false;
  return traceLines(message).every((line) => !line.trim() || isFileEditTraceLine(line));
}

export function activityDurationMs(
  messages: UIMessage[],
  active: boolean,
  now: number,
  completedLatencyMs?: number,
  startedAtMs?: number,
): number {
  if (!active && Number.isFinite(completedLatencyMs) && (completedLatencyMs ?? 0) >= 0) {
    return Math.round(completedLatencyMs ?? 0);
  }
  const timestamps = messages
    .map((message) => message.createdAt)
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return 0;
  const first = active && Number.isFinite(startedAtMs)
    ? startedAtMs ?? Math.min(...timestamps)
    : Math.min(...timestamps);
  const last = active && first > 1_000_000_000_000 ? now : Math.max(...timestamps);
  return Math.max(0, last - first);
}

export function formatDuration(milliseconds: number): string {
  const seconds = milliseconds > 0 && milliseconds < 1_000
    ? 1
    : Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function diffKindColor(
  kind: 'context' | 'add' | 'delete',
  colors: Palette,
): string {
  if (kind === 'add') return '#2F8F61';
  if (kind === 'delete') return '#C35A63';
  return colors.muted;
}

export function brandBorderColor(color: string, fallback: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return fallback;
  return `${color}38`;
}
