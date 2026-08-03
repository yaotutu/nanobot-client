import type { TFunction } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatSessionNextRun,
  formatSessionSchedule,
} from '@/features/automations/model/session-presentation';
import type { SessionAutomationJob } from '@/types/api/automations';

const t = ((key: string, options?: Record<string, unknown>) => (
  options ? `${key}:${JSON.stringify(options)}` : key
)) as TFunction;

function job(overrides: Partial<SessionAutomationJob> = {}): SessionAutomationJob {
  return {
    id: 'job-1',
    name: 'Summary',
    enabled: true,
    schedule: { kind: 'every', every_ms: 3_600_000 },
    payload: { message: 'Summarize' },
    state: {},
    ...overrides,
  };
}

describe('session automation presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats local, interval, and cron schedules', () => {
    expect(formatSessionSchedule(job({
      kind: 'local_trigger',
      schedule: { kind: 'local' },
      payload: { kind: 'local_trigger', message: '', command: '/sync' },
    }), t, 'en')).toBe('thread.sessionInfo.schedule.local');
    expect(formatSessionSchedule(job(), t, 'en')).toContain('1 hour');
    expect(formatSessionSchedule(job({
      schedule: { kind: 'cron', expr: '0 9 * * *', tz: 'UTC' },
    }), t, 'en')).toContain('thread.sessionInfo.schedule.cronWithTz');
  });

  it('formats disabled, pending, local, empty, and scheduled next runs', () => {
    expect(formatSessionNextRun(job({ enabled: false }), t, 'en'))
      .toBe('thread.sessionInfo.next.disabled');
    expect(formatSessionNextRun(job({ state: { pending: true } }), t, 'en'))
      .toBe('thread.sessionInfo.next.pending');
    expect(formatSessionNextRun(job({
      kind: 'local_trigger',
      schedule: { kind: 'local' },
      payload: { kind: 'local_trigger', message: '', command: '/sync' },
    }), t, 'en')).toBe('thread.sessionInfo.next.local');
    expect(formatSessionNextRun(job(), t, 'en'))
      .toBe('thread.sessionInfo.next.none');
    expect(formatSessionNextRun(job({
      state: { next_run_at_ms: Date.now() + 3_600_000 },
    }), t, 'en')).toContain('in 1 hour');
  });
});
