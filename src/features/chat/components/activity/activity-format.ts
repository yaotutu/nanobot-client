import { redactActivityText } from '@/services/text/log-redaction';
import type { Palette } from '@/ui/palette';
import type { UIMessage } from '@/types/api/chat';

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
