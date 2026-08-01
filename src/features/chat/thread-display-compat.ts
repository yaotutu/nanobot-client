import { isModelCommandResponseText, isModelCommandText } from '@/services/format';
import { isSystemCommandTurnId } from '@/features/connection/socket-transport';
import type { UIMessage } from '@/types/api';

/** Match websocket/session scrub: keep header + Result body only; trim model tail. */
const SUBAGENT_UI_RESULT_MAX_CHARS = 800;

/**
 * Strip the legacy Task assignment + Summarize tail from persisted subagent
 * announce blobs so the timeline reads like the WebUI mobile thread.
 */
export function scrubSubagentAnnounceBody(
  content: string,
  maxResultChars: number = SUBAGENT_UI_RESULT_MAX_CHARS,
): string {
  const stripped = content.replace(/\r\n/g, '\n').trim();
  if (!stripped.includes('[Subagent')) return content;
  const lines = stripped.split('\n');
  const header = lines.length > 0 && lines[0].startsWith('[Subagent') ? lines[0].trim() : '';

  const lower = stripped.toLowerCase();
  let key = '\nresult:\n';
  let ri = lower.indexOf(key);
  if (ri === -1) {
    key = '\nresult:';
    ri = lower.indexOf(key);
  }
  if (ri === -1) {
    return header || stripped;
  }

  let after = stripped.slice(ri + key.length).replace(/^\s+/, '');
  const summMarker = 'summarize this naturally';
  const si = after.toLowerCase().indexOf(summMarker);
  if (si !== -1) after = after.slice(0, si).trimEnd();

  let body = after.trim();
  if (maxResultChars > 0 && body.length > maxResultChars) {
    body = `${body.slice(0, maxResultChars - 1).trimEnd()}…`;
  }

  if (header && body) return `${header}\n\n${body}`;
  return header || body || stripped;
}

/** Apply the scrub to assistant rows that look like subagent inject announcements. */
export function scrubSubagentUiMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== 'assistant' || typeof m.content !== 'string') return m;
    if (!m.content.includes('[Subagent')) return m;
    const content = scrubSubagentAnnounceBody(m.content);
    return content === m.content ? m : { ...m, content };
  });
}

/**
 * Older WebUI disk snapshots and historical sessions may still contain
 * `kind: "long_task"` rows from the retired orchestrator UI. Map them to
 * ordinary trace rows so the thread stays readable without bespoke cards.
 */
export function normalizeLegacyLongTaskMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    const kind = (m as { kind?: string }).kind;
    if (kind !== 'long_task') return m;
    const text = (m.content ?? '').trim() || '(legacy thread activity)';
    return {
      id: m.id,
      role: 'tool' as const,
      kind: 'trace' as const,
      content: text,
      traces: [text],
      createdAt: m.createdAt,
    };
  });
}

/**
 * Replay timestamps an assistant row when its first output is recorded while
 * latency covers the whole turn. Derive the end from the matching user start
 * so the displayed time cannot double-count the pre-output interval.
 */
function deriveAssistantCompletionTimes(messages: UIMessage[]): UIMessage[] {
  const userStartedAtByTurn = new Map<string, number>();
  let latestUserStartedAt: number | undefined;

  return messages.map((message) => {
    if (message.role === 'user') {
      if (Number.isFinite(message.createdAt)) {
        latestUserStartedAt = message.createdAt;
        if (message.turnId) userStartedAtByTurn.set(message.turnId, message.createdAt);
      }
      return message;
    }
    if (
      message.role !== 'assistant'
      || message.kind === 'trace'
      || message.completedAt !== undefined
      || message.latencyMs === undefined
      || !Number.isFinite(message.latencyMs)
      || message.latencyMs < 0
    ) return message;

    const startedAt = message.turnId
      ? userStartedAtByTurn.get(message.turnId)
      : message.source
        ? undefined
        : latestUserStartedAt;
    if (startedAt === undefined) return message;
    return { ...message, completedAt: startedAt + message.latencyMs };
  });
}

/**
 * Single entry point used for every inbound thread payload — historical
 * fetch, canonical refresh and live websocket updates. Keeps the RN
 * composer and activity cluster aligned with WebUI mobile output.
 */
export function projectWebuiThreadMessages(messages: UIMessage[]): UIMessage[] {
  const normalized = scrubSubagentUiMessages(normalizeLegacyLongTaskMessages(messages));
  const hiddenTurns = new Set(
    normalized.flatMap((message) => (
      message.role === 'user'
      && isModelCommandText(message.content)
      && message.turnId
        ? [message.turnId]
        : []
    )),
  );
  const visible = normalized.filter((message) => (
    !isSystemCommandTurnId(message.turnId)
    && (!message.turnId || !hiddenTurns.has(message.turnId))
    && !(message.role === 'user' && isModelCommandText(message.content))
    && !(message.role === 'assistant' && isModelCommandResponseText(message.content))
  ));
  return deriveAssistantCompletionTimes(visible);
}
