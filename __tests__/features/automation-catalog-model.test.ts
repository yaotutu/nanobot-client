import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import {
  formatSchedule,
  matchesFilter,
  matchesSearch,
  parseSearchQuery,
  sortJobs,
} from '@/features/automations/model';
import type { SessionAutomationJob } from '@/types/api/automations';

const t = ((key: string) => key) as TFunction;

const job = (
  id: string,
  overrides: Partial<SessionAutomationJob> = {},
): SessionAutomationJob => ({
  id,
  name: id,
  enabled: true,
  schedule: { kind: 'every', every_ms: 3_600_000 },
  payload: { message: `Message for ${id}` },
  state: {},
  ...overrides,
});

describe('automation catalog model', () => {
  it('parses fielded and quoted search terms', () => {
    expect(parseSearchQuery('name:"Daily summary" status:active free-text unknown:value'))
      .toEqual([
        { field: 'name', value: 'daily summary' },
        { field: 'status', value: 'active' },
        { field: null, value: 'free-text' },
        { field: null, value: 'unknown:value' },
      ]);
  });

  it('matches fielded searches against job data', () => {
    const candidate = job('daily-summary', {
      name: 'Daily Summary',
      origin: { channel: 'slack', session_key: 'team-room' },
      state: { next_run_at_ms: 10_000 },
    });

    expect(matchesSearch(
      candidate,
      parseSearchQuery('name:daily chat:team-room status:active'),
      t,
      'en-US',
    )).toBe(true);
    expect(matchesSearch(candidate, parseSearchQuery('message:missing'), t, 'en-US'))
      .toBe(false);
  });

  it('filters jobs by derived status', () => {
    expect(matchesFilter(job('active', { state: { next_run_at_ms: 10_000 } }), 'active'))
      .toBe(true);
    expect(matchesFilter(job('paused', { enabled: false }), 'paused')).toBe(true);
    expect(matchesFilter(job('failed', { state: { last_status: 'error' } }), 'failed'))
      .toBe(true);
    expect(matchesFilter(job('system', { protected: true }), 'system')).toBe(true);
  });

  it('sorts by schedule timestamps with stable name fallbacks', () => {
    const jobs = [
      job('Beta', { state: { next_run_at_ms: 20, last_run_at_ms: 5 }, updated_at_ms: 10 }),
      job('Alpha', { state: { next_run_at_ms: 10, last_run_at_ms: 30 }, updated_at_ms: 20 }),
      job('Gamma', { state: {} }),
    ];

    expect(sortJobs(jobs, 'next', 'en-US').map((item) => item.id))
      .toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sortJobs(jobs, 'last', 'en-US').map((item) => item.id))
      .toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sortJobs(jobs, 'updated', 'en-US').map((item) => item.id))
      .toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sortJobs(jobs, 'name', 'en-US').map((item) => item.id))
      .toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(jobs.map((item) => item.id)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('formats common cron and local schedules', () => {
    expect(formatSchedule(job('daily', {
      schedule: { kind: 'cron', expr: '15 9 * * *' },
    }), t, 'en-US')).toBe('settings.automations.schedule.dailyAt');
    expect(formatSchedule(job('local', {
      kind: 'local_trigger',
      schedule: { kind: 'local' },
      payload: { kind: 'local_trigger', message: '', command: '/sync' },
    }), t, 'en-US')).toBe('settings.automations.schedule.local');
  });
});
