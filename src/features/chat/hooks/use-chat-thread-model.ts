import { useCallback, useMemo } from 'react';

import {
  normalizeActivityTimeline,
  type TurnUnit,
} from '@/features/chat/activity/model/activity-timeline';
import {
  assistantForkIndexes,
  currentActivityClusterIndices,
  unitIndexAfterMessageCount,
  unitKeysForDisplay,
} from '@/features/chat/model/timeline';
import type { UIMessage } from '@/types/api/chat';

interface UseChatThreadModelOptions {
  forkBoundaryMessageCount: number | null;
  messages: UIMessage[];
  turnActive: boolean;
  userMessageOffset: number;
}

export function useChatThreadModel({
  forkBoundaryMessageCount,
  messages,
  turnActive,
  userMessageOffset,
}: UseChatThreadModelOptions) {
  const units = useMemo(
    () => normalizeActivityTimeline(messages, {
      preserveTrailingActivity: turnActive,
    }),
    [messages, turnActive],
  );
  const unitKeys = useMemo(() => unitKeysForDisplay(units), [units]);
  const lastMessageUnitIndex = useMemo(() => {
    for (let index = units.length - 1; index >= 0; index -= 1) {
      if (units[index].type === 'message') return index;
    }
    return -1;
  }, [units]);
  const canRetryFromMessage = useCallback((unit: TurnUnit, unitIndex: number) => {
    if (unit.type !== 'message') return false;
    const message = unit.message;
    if (message.role !== 'assistant' || message.kind === 'trace') return false;
    if (message.isStreaming || unitIndex !== lastMessageUnitIndex) return false;
    return !units.slice(unitIndex + 1).some(
      (row) => row.type === 'message' && row.message.role === 'user',
    );
  }, [lastMessageUnitIndex, units]);

  return {
    canRetryFromMessage,
    forkBoundaryAfterUnitIndex: unitIndexAfterMessageCount(
      units,
      forkBoundaryMessageCount,
    ),
    forkIndexes: assistantForkIndexes(units, userMessageOffset),
    liveActivityClusterIndices: turnActive
      ? currentActivityClusterIndices(units)
      : new Set<number>(),
    unitKeys,
    units,
  };
}
