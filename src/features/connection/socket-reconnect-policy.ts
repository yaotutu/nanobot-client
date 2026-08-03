const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 15_000;

export function reconnectDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt)
    ? Math.max(0, Math.floor(attempt))
    : 0;
  return Math.min(
    INITIAL_RECONNECT_DELAY_MS * 2 ** safeAttempt,
    MAX_RECONNECT_DELAY_MS,
  );
}
