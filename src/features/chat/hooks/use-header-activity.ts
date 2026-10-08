import { useEffect, useMemo, useRef, useState } from 'react';

import {
  deriveHeaderActivity,
  type HeaderActivity,
} from '@/features/chat/activity/model/header-activity';
import type { TurnUnit } from '@/features/chat/activity/model/activity-timeline';
import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';

interface UseHeaderActivityOptions {
  cliApps?: CliAppInfo[];
  mcpPresets?: McpPresetInfo[];
  turnActive: boolean;
  units: TurnUnit[];
}

/**
 * 头部胶囊需要一个本地“完成瞬间”，否则历史会话每次进入都会短暂显示已完成。
 * 该状态只来自本轮 turnActive 的真实 false 边沿，不写入消息模型。
 */
export function useHeaderActivity({
  cliApps,
  mcpPresets,
  turnActive,
  units,
}: UseHeaderActivityOptions): HeaderActivity {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [completedAtMs, setCompletedAtMs] = useState<number | undefined>();
  const wasActiveRef = useRef(turnActive);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = turnActive;
    // 完成“瞬间”不需要阻塞渲染；放到下一帧可避免级联 setState。
    const frame = setTimeout(() => {
      if (turnActive) setCompletedAtMs(undefined);
      else if (wasActive) setCompletedAtMs(Date.now());
    }, 0);
    return () => clearTimeout(frame);
  }, [turnActive]);
  useEffect(() => {
    const hasCompletion = completedAtMs !== undefined;
    if (!turnActive && !hasCompletion) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [completedAtMs, turnActive]);

  return useMemo(() => deriveHeaderActivity(units, turnActive, {
    nowMs,
    completedAtMs,
    cliApps,
    mcpPresets,
  }), [cliApps, completedAtMs, mcpPresets, nowMs, turnActive, units]);
}
