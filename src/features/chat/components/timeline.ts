import type { TurnUnit } from '@/features/chat/activity-timeline';
import type { UIMessage } from '@/types/api/chat';

/**
 * Pure helpers for computing render metadata from a chat timeline.
 *
 * Extracted from the legacy god-component to keep `ChatThread` and the message
 * row components focused on layout, not key derivation or unit indexing.
 */

export function formatVoiceDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function assistantForkIndexes(units: TurnUnit[], userMessageOffset: number): Array<number | undefined> {
  const finalAssistant = new Array<boolean>(units.length).fill(true);
  let hasLaterUnitBeforeUser = false;
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (unit.type === 'message' && unit.message.role === 'user') {
      hasLaterUnitBeforeUser = false;
      continue;
    }
    if (unit.type === 'message' && unit.message.role === 'assistant') {
      finalAssistant[index] = !hasLaterUnitBeforeUser;
    }
    hasLaterUnitBeforeUser = true;
  }

  let nextUserIndex = Math.max(0, userMessageOffset);
  return units.map((unit, index) => {
    const forkIndex = unit.type === 'message' &&
      unit.message.role === 'assistant' &&
      finalAssistant[index]
      ? nextUserIndex
      : undefined;
    if (unit.type === 'message' && unit.message.role === 'user') nextUserIndex += 1;
    return forkIndex;
  });
}

export function unitIndexAfterMessageCount(
  units: TurnUnit[],
  messageCount: number | null | undefined,
): number | null {
  if (messageCount == null || messageCount <= 0) return null;
  let seen = 0;
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    seen += unit.type === 'activity' ? unit.messages.length : 1;
    if (seen >= messageCount) return index;
  }
  return null;
}

export function currentActivityClusterIndices(units: TurnUnit[]): Set<number> {
  const indices = new Set<number>();
  let markedCurrentActivity = false;
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (unit.type === 'activity') {
      if (!markedCurrentActivity) {
        indices.add(index);
        markedCurrentActivity = true;
      }
      continue;
    }
    if (unit.message.role === 'assistant' && unit.message.isStreaming) continue;
    if (unit.message.role === 'user') break;
  }
  return indices;
}

export function unitKeysForDisplay(units: TurnUnit[]): string[] {
  const bases = units.map((unit, index) => unitKeyBase(unit, index));
  const totals = new Map<string, number>();
  const occurrences = new Map<string, number>();

  for (const base of bases) {
    totals.set(base, (totals.get(base) ?? 0) + 1);
  }

  return bases.map((base) => {
    const isUserTurn = base.startsWith('turn-') && base.endsWith('-user');
    if (!isUserTurn && totals.get(base) === 1) return base;
    const next = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, next);
    return `${base}-${next}`;
  });
}

function unitKeyBase(unit: TurnUnit, index: number): string {
  if (unit.type === 'activity') {
    const anchor = unit.messages[0];
    const turnKey = stableTurnMessageKey(anchor, 'activity');
    if (turnKey) return turnKey;
    const anchorId = anchor?.id;
    return anchorId != null ? `activity-${anchorId}` : `activity-idx-${index}`;
  }
  const turnKey = stableTurnMessageKey(unit.message);
  if (turnKey) return turnKey;
  return unit.message.id || `message-${index}`;
}

export function stableTurnMessageKey(message: UIMessage | undefined, fallbackPhase?: string): string | null {
  if (!message?.turnId) return null;
  const phase = message.turnPhase ?? fallbackPhase ?? message.kind ?? message.role;
  if (message.role === 'user') return `turn-${message.turnId}-user`;
  if (message.kind === 'trace') {
    return `turn-${message.turnId}-${phase}-${message.activitySegmentId ?? 'activity'}`;
  }
  return `turn-${message.turnId}-${phase}`;
}
