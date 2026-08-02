import { canonicalToolTrace } from '@/features/chat/tool-traces';
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
import { logoFallbackUrls } from '@/services/links/provider-brand';
import {
  compactActivityPath,
  redactShellCommand,
  safeActivityDetail,
} from '@/services/text/log-redaction';
import type { CliAppInfo, McpPresetInfo } from '@/types/api/capabilities';
import type { UIMessage } from '@/types/api/chat';

import { traceLines } from './activity-format';
import {
  capabilityInitials,
  cliRunMapByTraceLine,
  formatCliArgs,
  mcpRunMapByTraceLine,
  parseCliRunTrace,
  parseMcpRunTrace,
  titleFromCapabilityName,
} from './command-run-model';
import {
  compactEventToolName,
  isMcpToolName,
  normalizeToolStatus,
  toolEventArguments,
  toolEventName,
  toolEventStatesByTraceLine,
} from './tool-event-model';
import type { CliRunSummary, McpRunSummary, ToolRowModel } from './tool-types';

const FILE_EDIT_TOOL_NAMES = new Set(['write_file', 'edit_file', 'apply_patch']);

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


export function genericToolIcon(family: GenericToolRunItem['trace']['family']): ToolRowModel['icon'] {
  if (family === 'content-search' || family === 'file-search') return 'file-search';
  if (family === 'list') return 'list';
  if (family === 'read') return 'folder';
  if (family === 'memory') return 'memory';
  return 'play';
}

