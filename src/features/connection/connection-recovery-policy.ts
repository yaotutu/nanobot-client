import type { ConnectionStatus } from '@/types/api/runtime';

export type ReconnectReason =
  | 'foreground'
  | 'network-restored'
  | 'manual'
  | 'auth-refreshed'
  | 'accept-timeout'
  | 'socket-closed';

export const BACKGROUND_RECONNECT_AFTER_MS = 10_000;
export const STALE_CONNECTION_AFTER_MS = 45_000;

export function shouldReconnectOnForeground(options: {
  networkAvailable: boolean;
  status: ConnectionStatus;
  backgroundDurationMs: number;
  activityAgeMs: number;
}): boolean {
  return options.networkAvailable && (
    options.backgroundDurationMs >= BACKGROUND_RECONNECT_AFTER_MS
    || options.status !== 'open'
    || options.activityAgeMs >= STALE_CONNECTION_AFTER_MS
  );
}
