import { describe, expect, it } from 'vitest';

import {
  draftFromJob,
  editDraftError,
  intervalDraft,
  scheduleChanged,
  scheduleFromDraft,
  updatePayloadFromDraft,
} from '@/features/automations/model/automation-edit-model';
import type { SessionAutomationJob } from '@/types/api/automations';

const job: SessionAutomationJob = {
  id: 'job-1',
  name: 'Daily summary',
  enabled: true,
  schedule: { kind: 'every', every_ms: 3_600_000 },
  payload: { message: 'Summarize the day' },
  state: {},
};
const t = ((key: string) => key) as never;

describe('automation edit model', () => {
  it('chooses the largest exact interval unit', () => {
    expect(intervalDraft(7_200_000)).toEqual({ value: '2', unit: 'hour' });
    expect(intervalDraft(90_000)).toEqual({ value: '90', unit: 'second' });
  });

  it('omits an unchanged schedule from the update payload', () => {
    const draft = draftFromJob(job, 1_000);
    expect(scheduleChanged(draft, job)).toBe(false);
    expect(updatePayloadFromDraft(draft, job)).toEqual({
      name: 'Daily summary',
      message: 'Summarize the day',
    });
  });

  it('builds cron and at schedules', () => {
    const draft = draftFromJob(job);
    expect(scheduleFromDraft({ ...draft, scheduleKind: 'cron', cronExpr: ' 0 9 * * * ', tz: ' UTC ' }))
      .toEqual({ kind: 'cron', expr: '0 9 * * *', tz: 'UTC' });
    expect(scheduleFromDraft({ ...draft, scheduleKind: 'at', atDate: new Date(123_456) }))
      .toEqual({ kind: 'at', at_ms: 123_456 });
  });

  it('validates past one-off schedules only when changed', () => {
    const atJob = { ...job, schedule: { kind: 'at', at_ms: 10_000 } } satisfies SessionAutomationJob;
    const draft = draftFromJob(atJob);
    expect(editDraftError(draft, atJob, t, 20_000)).toBeNull();
    expect(editDraftError({ ...draft, atDate: new Date(9_000) }, atJob, t, 20_000))
      .toBe('settings.automations.validation.futureRequired');
  });

  it('allows local triggers to update only their name', () => {
    const local = {
      ...job,
      kind: 'local_trigger',
      schedule: { kind: 'local' },
      payload: { kind: 'local_trigger', message: '', command: '/sync' },
    } satisfies SessionAutomationJob;
    expect(updatePayloadFromDraft({ ...draftFromJob(local), name: ' Sync ' }, local))
      .toEqual({ name: 'Sync' });
  });
});
