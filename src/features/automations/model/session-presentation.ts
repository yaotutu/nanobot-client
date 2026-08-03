import type { TFunction } from 'i18next';

import { formatDateTime, relativeTimeFromMs, safeNumberFormat } from '@/services/text/format';
import type { SessionAutomationJob } from '@/types/api/automations';

import { isLocalTrigger } from './status';

export function formatSessionSchedule(
  job: SessionAutomationJob,
  t: TFunction,
  locale: string,
): string {
  if (isLocalTrigger(job)) return t('thread.sessionInfo.schedule.local');
  if (job.schedule.kind === 'at' && job.schedule.at_ms) {
    return t('thread.sessionInfo.schedule.at', {
      time: formatDateTime(job.schedule.at_ms, locale),
    });
  }
  if (job.schedule.kind === 'every' && job.schedule.every_ms) {
    return t('thread.sessionInfo.schedule.every', {
      duration: formatSessionDuration(job.schedule.every_ms, locale),
    });
  }
  if (job.schedule.kind === 'cron' && job.schedule.expr) {
    return job.schedule.tz
      ? t('thread.sessionInfo.schedule.cronWithTz', {
          expr: job.schedule.expr,
          tz: job.schedule.tz,
        })
      : t('thread.sessionInfo.schedule.cron', { expr: job.schedule.expr });
  }
  return t('thread.sessionInfo.schedule.unknown');
}

export function formatSessionNextRun(
  job: SessionAutomationJob,
  t: TFunction,
  locale: string,
): string {
  if (!job.enabled) return t('thread.sessionInfo.next.disabled');
  if (job.state.pending) return t('thread.sessionInfo.next.pending');
  if (isLocalTrigger(job)) return t('thread.sessionInfo.next.local');
  const next = job.state.next_run_at_ms;
  if (!next) return t('thread.sessionInfo.next.none');
  return t('thread.sessionInfo.next.label', {
    time: relativeTimeFromMs(next, undefined, locale),
  });
}

function formatSessionDuration(ms: number, locale: string): string {
  const units: Array<[Intl.NumberFormatOptions['unit'], number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
  ];
  for (const [unit, size] of units) {
    if (ms >= size && ms % size === 0) {
      return safeNumberFormat(locale, {
        style: 'unit',
        unit,
        unitDisplay: 'long',
      }).format(ms / size);
    }
  }
  return safeNumberFormat(locale, {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'long',
    maximumFractionDigits: 1,
  }).format(ms / 60_000);
}
