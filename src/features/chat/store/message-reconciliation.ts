import type { UIMessage } from '@/types/api/chat/messages';

export function sameSemanticMessage(left: UIMessage, right: UIMessage): boolean {
  if (left.id && right.id && left.id === right.id) return true;
  return (
    left.role === right.role
    && (left.kind ?? '') === (right.kind ?? '')
    && left.content === right.content
    && (!left.turnId || !right.turnId || left.turnId === right.turnId)
  );
}

export function mergeLatestMessages(
  current: UIMessage[],
  latest: UIMessage[],
): UIMessage[] {
  if (current.length === 0) return latest;
  const maxOverlap = Math.min(current.length, latest.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const start = current.length - overlap;
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (!sameSemanticMessage(current[start + index], latest[index])) {
        matches = false;
        break;
      }
    }
    if (matches) return [...current.slice(0, start), ...latest];
  }
  const seenIds = new Set(current.map((message) => message.id).filter(Boolean));
  const extras = latest.filter((message) => !message.id || !seenIds.has(message.id));
  return [...extras, ...current];
}

export function prependOlderMessages(
  current: UIMessage[],
  older: UIMessage[],
): UIMessage[] {
  if (older.length === 0) return current;
  const firstCurrent = current[0];
  const boundary = firstCurrent
    ? older.findIndex((message) => sameSemanticMessage(message, firstCurrent))
    : -1;
  const prefix = boundary >= 0 ? older.slice(0, boundary) : older;
  const seen = new Set(current.map((message) => message.id));
  return [...prefix.filter((message) => !seen.has(message.id)), ...current];
}
