import { describe, expect, it } from 'vitest';

import {
  BACKGROUND_RECONNECT_AFTER_MS,
  STALE_CONNECTION_AFTER_MS,
  shouldReconnectOnForeground,
} from '@/features/connection/connection-recovery-policy';

describe('connection recovery policy', () => {
  it('does not reconnect a recent healthy connection after a brief background', () => {
    expect(shouldReconnectOnForeground({
      networkAvailable: true,
      status: 'open',
      backgroundDurationMs: BACKGROUND_RECONNECT_AFTER_MS - 1,
      activityAgeMs: STALE_CONNECTION_AFTER_MS - 1,
    })).toBe(false);
  });

  it('reconnects after a long background or stale connection', () => {
    expect(shouldReconnectOnForeground({
      networkAvailable: true,
      status: 'open',
      backgroundDurationMs: BACKGROUND_RECONNECT_AFTER_MS,
      activityAgeMs: 0,
    })).toBe(true);
    expect(shouldReconnectOnForeground({
      networkAvailable: true,
      status: 'open',
      backgroundDurationMs: 0,
      activityAgeMs: STALE_CONNECTION_AFTER_MS,
    })).toBe(true);
  });

  it('reconnects a non-open socket but never reconnects while offline', () => {
    expect(shouldReconnectOnForeground({
      networkAvailable: true,
      status: 'reconnecting',
      backgroundDurationMs: 0,
      activityAgeMs: 0,
    })).toBe(true);
    expect(shouldReconnectOnForeground({
      networkAvailable: false,
      status: 'closed',
      backgroundDurationMs: Number.POSITIVE_INFINITY,
      activityAgeMs: Number.POSITIVE_INFINITY,
    })).toBe(false);
  });
});
