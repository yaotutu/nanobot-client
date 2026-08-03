import type { TFunction } from 'i18next';

import {
  relativeTimeFromMs,
  safeDateTimeFormat,
  safeNumberFormat,
} from '@/services/text/format';
import type { SessionAutomationJob } from '@/types/api/automations';

import { isLocalTrigger } from './status';
import { EVERY_UNITS } from './types';

export function formatSchedule(job: SessionAutomationJob, t: TFunction, locale: string): string {
  if (job.schedule.kind === 'at' && job.schedule.at_ms) {
    return t('settings.automations.schedule.at', { time: formatDateTime(job.schedule.at_ms, locale) });
  }
  if (job.schedule.kind === 'every' && job.schedule.every_ms) {
    return t('settings.automations.schedule.every', { duration: formatInterval(job.schedule.every_ms, t, locale) });
  }
  if (job.schedule.kind === 'cron' && job.schedule.expr) {
    const summary = formatCronSummary(job.schedule.expr, t);
    if (summary) {
      return job.schedule.tz
        ? t('settings.automations.schedule.withTz', { summary, tz: job.schedule.tz })
        : summary;
    }
    return job.schedule.tz
      ? t('settings.automations.schedule.cronWithTz', { expr: job.schedule.expr, tz: job.schedule.tz })
      : t('settings.automations.schedule.cron', { expr: job.schedule.expr });
  }
  if (isLocalTrigger(job)) return t('settings.automations.schedule.local');
  return t('settings.automations.schedule.custom');
}

function formatCronSummary(expr: string, t: TFunction): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const numericMinute = cronNumericToken(minute, 59);
  const numericHour = cronNumericToken(hour, 23);
  const everyDay = dayOfMonth === '*' && month === '*' && dayOfWeek === '*';
  const weekdays = dayOfMonth === '*' && month === '*' && ['1-5', 'MON-FRI', 'mon-fri'].includes(dayOfWeek);
  if (numericMinute !== null && numericHour !== null) {
    const time = `${String(numericHour).padStart(2, '0')}:${String(numericMinute).padStart(2, '0')}`;
    if (everyDay) return t('settings.automations.schedule.dailyAt', { time });
    if (weekdays) return t('settings.automations.schedule.weekdaysAt', { time });
  }
  const paddedMinute = numericMinute === null ? '' : String(numericMinute).padStart(2, '0');
  if (everyDay && numericMinute !== null && hour === '*') {
    return t('settings.automations.schedule.hourlyAt', { minute: paddedMinute });
  }
  const range = /^(\d{1,2})-(\d{1,2})$/.exec(hour);
  if (everyDay && numericMinute !== null && range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start <= 23 && end <= 23) {
      return t('settings.automations.schedule.hourlyWindow', {
        start: String(start).padStart(2, '0'),
        end: String(end).padStart(2, '0'),
        minute: paddedMinute,
      });
    }
  }
  return null;
}

function cronNumericToken(value: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed <= max ? parsed : null;
}

export function formatNext(job: SessionAutomationJob, t: TFunction, locale: string): string {
  if (!job.enabled) return t('settings.automations.next.paused');
  if (job.state.pending) return t('settings.automations.next.pending');
  if (isLocalTrigger(job)) return t('settings.automations.next.local');
  if (!job.state.next_run_at_ms) return t('settings.automations.next.none');
  return relativeTimeFromMs(job.state.next_run_at_ms, undefined, locale);
}

export function formatNextTitle(job: SessionAutomationJob, t: TFunction, locale: string): string {
  return job.state.next_run_at_ms ? formatDateTime(job.state.next_run_at_ms, locale) : formatNext(job, t, locale);
}

export function formatDateTime(ms: number | null | undefined, locale: string): string {
  if (!ms || !Number.isFinite(ms)) return '';
  return safeDateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

function formatInterval(ms: number, t: TFunction, locale: string): string {
  const units = [...EVERY_UNITS].reverse();
  for (const unit of units) {
    if (ms >= unit.ms && ms % unit.ms === 0) {
      return `${safeNumberFormat(locale).format(ms / unit.ms)} ${t(`settings.automations.everyUnits.${unit.key}`)}`;
    }
  }
  const unit = ms < 60_000 ? EVERY_UNITS[0] : EVERY_UNITS[1];
  const value = ms / unit.ms;
  return `${safeNumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${t(`settings.automations.everyUnits.${unit.key}`)}`;
}
