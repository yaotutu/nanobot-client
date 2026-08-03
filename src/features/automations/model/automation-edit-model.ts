import type { TFunction } from 'i18next';

import {
  EVERY_UNITS,
  isLocalTrigger,
  type EditDraft,
  type EveryUnit,
  type ScheduleKind,
} from '@/features/automations/model';
import type {
  AutomationUpdatePayload,
  SessionAutomationJob,
} from '@/types/api/automations';

export function draftFromJob(job: SessionAutomationJob | null, now = Date.now()): EditDraft {
  const every = intervalDraft(job?.schedule.every_ms ?? 3_600_000);
  const kind: ScheduleKind = job?.schedule.kind === 'at' || job?.schedule.kind === 'cron'
    ? job.schedule.kind
    : 'every';
  return {
    name: job?.name ?? '',
    message: job?.payload.message ?? '',
    scheduleKind: kind,
    everyValue: every.value,
    everyUnit: every.unit,
    cronExpr: job?.schedule.expr ?? '0 9 * * *',
    tz: job?.schedule.tz ?? '',
    atDate: new Date(job?.schedule.at_ms ?? now + 3_600_000),
  };
}

export function intervalDraft(ms: number): { value: string; unit: EveryUnit } {
  for (const unit of [...EVERY_UNITS].reverse()) {
    if (ms >= unit.ms && ms % unit.ms === 0) {
      return { value: String(ms / unit.ms), unit: unit.key };
    }
  }
  return { value: String(Math.max(1, Math.round(ms / 60_000))), unit: 'minute' };
}

export function editDraftError(
  draft: EditDraft,
  job: SessionAutomationJob,
  t: TFunction,
  now = Date.now(),
): string | null {
  if (!draft.name.trim()) return t('settings.automations.validation.nameRequired');
  if (isLocalTrigger(job)) return null;
  if (!draft.message.trim()) return t('settings.automations.validation.messageRequired');
  if (draft.scheduleKind === 'every') {
    const value = Number(draft.everyValue);
    if (!Number.isInteger(value) || value <= 0) {
      return t('settings.automations.validation.intervalRequired');
    }
  }
  if (draft.scheduleKind === 'cron' && !draft.cronExpr.trim()) {
    return t('settings.automations.validation.cronRequired');
  }
  if (draft.scheduleKind === 'at') {
    const atMs = draft.atDate.getTime();
    if (!Number.isFinite(atMs)) return t('settings.automations.validation.timeRequired');
    if (atMs <= now && scheduleChanged(draft, job)) {
      return t('settings.automations.validation.futureRequired');
    }
  }
  return null;
}

export function scheduleFromDraft(
  draft: EditDraft,
): NonNullable<AutomationUpdatePayload['schedule']> | string {
  if (draft.scheduleKind === 'every') {
    const unit = EVERY_UNITS.find((candidate) => candidate.key === draft.everyUnit);
    const value = Number(draft.everyValue);
    if (!unit || !Number.isInteger(value) || value <= 0) return 'invalid';
    return { kind: 'every', every_ms: value * unit.ms };
  }
  if (draft.scheduleKind === 'cron') {
    const expr = draft.cronExpr.trim();
    if (!expr) return 'invalid';
    return { kind: 'cron', expr, ...(draft.tz.trim() ? { tz: draft.tz.trim() } : {}) };
  }
  const atMs = draft.atDate.getTime();
  return Number.isFinite(atMs) ? { kind: 'at', at_ms: atMs } : 'invalid';
}

export function scheduleChanged(
  draft: EditDraft,
  job: SessionAutomationJob,
  schedule: NonNullable<AutomationUpdatePayload['schedule']> | string = scheduleFromDraft(draft),
): boolean {
  if (typeof schedule === 'string') return true;
  if (schedule.kind !== job.schedule.kind) return true;
  if (schedule.kind === 'every') return schedule.every_ms !== job.schedule.every_ms;
  if (schedule.kind === 'cron') {
    return schedule.expr !== (job.schedule.expr ?? '')
      || (schedule.tz ?? null) !== (job.schedule.tz ?? null);
  }
  return schedule.at_ms !== job.schedule.at_ms;
}

export function updatePayloadFromDraft(
  draft: EditDraft,
  job: SessionAutomationJob,
): AutomationUpdatePayload | string {
  const name = draft.name.trim();
  if (isLocalTrigger(job)) return name ? { name } : 'invalid';
  const message = draft.message.trim();
  if (!name || !message) return 'invalid';
  const values: AutomationUpdatePayload = { name, message };
  const schedule = scheduleFromDraft(draft);
  if (typeof schedule === 'string') return schedule;
  if (scheduleChanged(draft, job, schedule)) values.schedule = schedule;
  return values;
}
