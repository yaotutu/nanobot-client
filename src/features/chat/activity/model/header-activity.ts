import { coalesceActivityMessages } from '@/features/chat/activity/model/activity-message-model';
import {
  collectFileEdits,
  toolRows,
  summarizeFileEdits,
  traceLines,
} from '@/features/chat/activity/model/tool-helpers';
import { isReasoningOnlyAssistant, type TurnUnit } from '@/features/chat/activity/model/activity-timeline';
import type { Palette } from '@/ui/palette';
import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type { UIMessage } from '@/types/api/chat/messages';

/** 头部胶囊只关心少量稳定状态，避免把活动详情组件直接挂到顶栏。 */
export type HeaderActivityPhase =
  | 'idle'
  | 'thinking'
  | 'tool'
  | 'file'
  | 'replying'
  | 'waiting'
  | 'done'
  | 'error';

export interface HeaderActivity {
  phase: HeaderActivityPhase;
  elapsedMs?: number;
  durationMs?: number;
  reasoningStepCount: number;
  toolCallCount: number;
  fileEditCount: number;
}

export interface AgentActivityPanelModel {
  startedAtMs?: number;
  userPrompt?: string;
  activityMessages: UIMessage[];
  fileEdits: ReturnType<typeof summarizeFileEdits>;
  reasoningStepCount: number;
  toolCallCount: number;
}

/**
 * 从消息时间轴提取最后一个用户回合。头部胶囊与二级活动面板共用这份模型，
 * 保证两个入口展示的统计口径一致。
 */
export function deriveAgentActivityPanel(
  units: TurnUnit[],
  active: boolean,
  cliApps: CliAppInfo[] = [],
  mcpPresets: McpPresetInfo[] = [],
): AgentActivityPanelModel {
  const lastUserIndex = findLastIndex(units, (unit) => (
    unit.type === 'message' && unit.message.role === 'user'
  ));
  const turnUnits = lastUserIndex >= 0 ? units.slice(lastUserIndex) : units;
  const allMessages = turnUnits.flatMap((unit) => (
    unit.type === 'message' ? [unit.message] : unit.messages
  ));
  const activityMessages = coalesceActivityMessages(
    allMessages.filter((message) => (
      message.kind === 'trace' || isReasoningOnlyAssistant(message)
    )),
  );
  const cliAppsByName = new Map(
    cliApps.map((app) => [app.name.toLowerCase(), app]),
  );
  const mcpPresetsByName = new Map(
    mcpPresets.map((preset) => [preset.name.toLowerCase(), preset]),
  );
  const fileEdits = summarizeFileEdits(
    collectFileEdits(activityMessages),
    active,
  );
  const toolCallCount = activityMessages.reduce(
    (count, message) => count + safeToolRowCount(
      message,
      active,
      cliAppsByName,
      mcpPresetsByName,
    ),
    0,
  );
  const reasoningStepCount = activityMessages.filter(isReasoningOnlyAssistant).length;
  const userMessage = lastUserIndex >= 0 && turnUnits[0]?.type === 'message'
    ? turnUnits[0].message
    : undefined;

  return {
    startedAtMs: userMessage?.createdAt,
    userPrompt: userMessage?.content,
    activityMessages,
    fileEdits,
    reasoningStepCount,
    toolCallCount,
  };
}

/**
 * 派生头部状态。completedAtMs 只由 hook 在 turnActive 从 true 变 false 时记录，
 * 历史消息首次打开时不会误显示“已完成”。
 */
export function deriveHeaderActivity(
  units: TurnUnit[],
  turnActive: boolean,
  options: {
    nowMs?: number;
    completedAtMs?: number;
    cliApps?: CliAppInfo[];
    mcpPresets?: McpPresetInfo[];
  } = {},
): HeaderActivity {
  const panel = deriveAgentActivityPanel(
    units,
    turnActive,
    options.cliApps,
    options.mcpPresets,
  );
  const base = {
    reasoningStepCount: panel.reasoningStepCount,
    toolCallCount: panel.toolCallCount,
    fileEditCount: panel.fileEdits.length,
  };
  const nowMs = options.nowMs ?? Date.now();
  const elapsedMs = panel.startedAtMs !== undefined
    ? Math.max(0, nowMs - panel.startedAtMs)
    : undefined;

  if (!turnActive) {
    if (!options.completedAtMs) {
      return { ...base, phase: 'idle' };
    }
    const durationMs = panel.startedAtMs !== undefined
      ? Math.max(
        0,
        (options.completedAtMs - panel.startedAtMs) || elapsedAtCompletion(panel, options.completedAtMs),
      )
      : undefined;
    return {
      ...base,
      phase: nowMs - options.completedAtMs < 6_000 ? 'done' : 'idle',
      durationMs,
    };
  }

  const lastUnit = [...units].reverse().find((unit): unit is Extract<TurnUnit, { type: 'message' }> => (
    unit.type === 'message'
    && unit.message.role === 'assistant'
    && unit.message.kind !== 'trace'
  ));
  if (lastUnit?.message.isStreaming && lastUnit.message.content.trim()) {
    return { ...base, phase: 'replying', elapsedMs };
  }

  const hasError = hasPanelError(panel, options.cliApps, options.mcpPresets);
  if (hasError) return { ...base, phase: 'error', elapsedMs };

  const lastEditingFile = panel.fileEdits.some((edit) => edit.status === 'editing');
  if (lastEditingFile) return { ...base, phase: 'file', elapsedMs };

  const hasRunningTool = panel.activityMessages.some((message) => safeToolRowsForStatus(
    message,
    true,
    options.cliApps,
    options.mcpPresets,
  ).some((row) => row.status === 'running'));
  const lastReasoning = [...panel.activityMessages]
    .reverse()
    .find((message) => isReasoningOnlyAssistant(message) && (message.reasoningStreaming || message.isStreaming));
  if (hasRunningTool && !lastReasoning?.reasoningStreaming) {
    return { ...base, phase: 'tool', elapsedMs };
  }
  if (lastReasoning) return { ...base, phase: 'thinking', elapsedMs };

  const latestPhase = panel.activityMessages.at(-1)?.turnPhase;
  if (latestPhase === 'reasoning') return { ...base, phase: 'thinking', elapsedMs };
  if (latestPhase === 'answer') return { ...base, phase: 'replying', elapsedMs };
  if (latestPhase === 'complete') return { ...base, phase: 'waiting', elapsedMs };
  return { ...base, phase: panel.activityMessages.length ? 'tool' : 'thinking', elapsedMs };
}

/** 延迟完成场景下尝试使用最后一个消息的本地耗时，避免显示 0 秒。 */
function elapsedAtCompletion(
  panel: AgentActivityPanelModel,
  completedAtMs: number,
): number {
  const lastCreatedAt = panel.activityMessages.at(-1)?.createdAt;
  return lastCreatedAt !== undefined
    ? Math.max(0, completedAtMs - lastCreatedAt)
    : 0;
}

function hasPanelError(
  panel: AgentActivityPanelModel,
  cliApps?: CliAppInfo[],
  mcpPresets?: McpPresetInfo[],
): boolean {
  if (panel.fileEdits.some((edit) => edit.status === 'error')) return true;
  return panel.activityMessages.some((message) => safeToolRowsForStatus(
    message,
    true,
    cliApps,
    mcpPresets,
  ).some((row) => row.status === 'error'));
}

function safeToolRowCount(
  message: UIMessage,
  active: boolean,
  cliAppsByName: Map<string, CliAppInfo>,
  mcpPresetsByName: Map<string, McpPresetInfo>,
): number {
  // toolRows 已处理 trace、progress event 以及文件工具的合并规则；
  // 这里只取行数，不额外发明第二套统计口径。
  return safeToolRowsForStatus(
    message,
    active,
    [...cliAppsByName.values()],
    [...mcpPresetsByName.values()],
  ).length;
}

function safeToolRowsForStatus(
  message: UIMessage,
  active: boolean,
  cliApps?: CliAppInfo[],
  mcpPresets?: McpPresetInfo[],
) {
  const cliAppsByName = new Map(
    (cliApps ?? []).map((app) => [app.name.toLowerCase(), app]),
  );
  const mcpPresetsByName = new Map(
    (mcpPresets ?? []).map((preset) => [preset.name.toLowerCase(), preset]),
  );
  try {
    return toolRows(message, active, cliAppsByName, mcpPresetsByName);
  } catch {
    // 部分历史 trace 可能缺少可解析参数；统计阶段不能让头部胶囊崩溃。
    return traceLines(message).map((line, index) => ({
      key: `fallback:${index}:${line}`,
      label: line,
      status: 'done' as const,
    }));
  }
}

function findLastIndex<T>(
  items: T[],
  predicate: (item: T) => boolean,
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

/** 预留类型给视觉层，确保状态点配色不散落在组件内部。 */
export function headerActivityDotColor(
  phase: HeaderActivityPhase,
  colors: Palette,
): string {
  if (phase === 'tool' || phase === 'replying') return '#2F80ED';
  if (phase === 'waiting') return '#F59E0B';
  if (phase === 'done') return '#22C55E';
  if (phase === 'error') return '#DC2626';
  return colors.subtle;
}
