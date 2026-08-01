import type { TFunction } from 'i18next';

import { relativeTimeFromMs, safeDateTimeFormat, safeNumberFormat } from '@/services/format';
import type { SessionAutomationJob } from '@/types/api';

export type AutomationFilter = 'all' | 'active' | 'paused' | 'failed' | 'system';
export type AutomationSort = 'next' | 'last' | 'updated' | 'name';
export type AutomationAction = 'enable' | 'disable' | 'delete' | 'run';
export type AutomationStatus = 'active' | 'running' | 'paused' | 'failed' | 'system' | 'completed' | 'idle';
export type EveryUnit = 'second' | 'minute' | 'hour' | 'day';
export type ScheduleKind = 'at' | 'every' | 'cron';

export interface SearchToken {
  field: 'id' | 'name' | 'message' | 'chat' | 'cron' | 'schedule' | 'status' | null;
  value: string;
}

export interface EditDraft {
  name: string;
  message: string;
  scheduleKind: ScheduleKind;
  everyValue: string;
  everyUnit: EveryUnit;
  cronExpr: string;
  tz: string;
  atDate: Date;
}

export const SEARCH_FIELDS = new Set(['id', 'name', 'message', 'chat', 'cron', 'schedule', 'status']);
export const AUTOMATION_CHANNELS = new Set([
  'api', 'cli', 'dingtalk', 'discord', 'email', 'feishu', 'matrix', 'msteams', 'qq', 'slack',
  'telegram', 'wechat', 'wecom', 'weixin', 'whatsapp',
]);
export const FILTERS: AutomationFilter[] = ['all', 'active', 'paused', 'failed', 'system'];
export const SORTS: AutomationSort[] = ['next', 'last', 'updated', 'name'];
export const EVERY_UNITS: Array<{ key: EveryUnit; ms: number }> = [
  { key: 'second', ms: 1_000 },
  { key: 'minute', ms: 60_000 },
  { key: 'hour', ms: 3_600_000 },
  { key: 'day', ms: 86_400_000 },
];

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isLocalTrigger(job: SessionAutomationJob | null): boolean {
  return Boolean(job && (job.kind === 'local_trigger' || job.payload.kind === 'local_trigger' || job.schedule.kind === 'local'));
}

export function automationTriggerCommand(job: SessionAutomationJob): string {
  return job.trigger?.command || job.payload.command || job.payload.message || '';
}

export function automationSummary(job: SessionAutomationJob, t: TFunction): string {
  if (isLocalTrigger(job)) return automationTriggerCommand(job) || t('settings.automations.localTrigger');
  return job.payload.message || t('settings.automations.systemTask');
}

export function automationNeedsAttention(job: SessionAutomationJob): boolean {
  return job.state.last_status === 'error';
}

export function automationStatusKey(job: SessionAutomationJob): AutomationStatus {
  if (job.protected) return 'system';
  if (job.state.pending) return 'running';
  if (!job.enabled) return 'paused';
  if (job.state.last_status === 'error') return 'failed';
  if (isLocalTrigger(job)) return 'active';
  if (job.delete_after_run && !job.state.next_run_at_ms && job.state.last_status === 'ok') return 'completed';
  if (!job.state.next_run_at_ms) return 'idle';
  return 'active';
}

export function automationStatus(job: SessionAutomationJob, t: TFunction): { label: string; tone: 'neutral' | 'success' | 'warning' } {
  const status = automationStatusKey(job);
  const key = status === 'idle' ? 'noSchedule' : status;
  const tone = status === 'active' ? 'success' : status === 'running' || status === 'failed' ? 'warning' : 'neutral';
  return { label: t(`settings.automations.status.${key}`), tone };
}

export function statusDotColor(job: SessionAutomationJob): string {
  const status = automationStatusKey(job);
  if (status === 'active' || status === 'running') return '#F18B43';
  if (status === 'failed') return '#D8A43B';
  return '#A5A39D';
}

export function matchesFilter(job: SessionAutomationJob, filter: AutomationFilter): boolean {
  const status = automationStatusKey(job);
  if (filter === 'active') return status === 'active' || status === 'running';
  if (filter === 'paused') return status === 'paused';
  if (filter === 'failed') return automationNeedsAttention(job);
  if (filter === 'system') return Boolean(job.protected);
  return true;
}

export function sortJobs(jobs: SessionAutomationJob[], sort: AutomationSort, locale: string): SessionAutomationJob[] {
  const byName = (left: SessionAutomationJob, right: SessionAutomationJob) =>
    (left.name || left.id).localeCompare(right.name || right.id, locale);
  return [...jobs].sort((left, right) => {
    if (sort === 'name') return byName(left, right);
    if (sort === 'last') return (right.state.last_run_at_ms ?? 0) - (left.state.last_run_at_ms ?? 0) || byName(left, right);
    if (sort === 'updated') return (right.updated_at_ms ?? 0) - (left.updated_at_ms ?? 0) || byName(left, right);
    return (left.state.next_run_at_ms ?? Number.MAX_SAFE_INTEGER) - (right.state.next_run_at_ms ?? Number.MAX_SAFE_INTEGER) || byName(left, right);
  });
}

export function parseSearchQuery(query: string): SearchToken[] {
  return (query.match(/[^\s:]+:"[^"]+"|"[^"]+"|\S+/g) ?? [])
    .map((raw): SearchToken | null => {
      const part = trimSearchValue(raw);
      if (!part) return null;
      const match = part.match(/^([A-Za-z]+):(.*)$/);
      if (!match) return { field: null, value: part.toLowerCase() };
      const field = match[1].toLowerCase();
      const value = trimSearchValue(match[2]).toLowerCase();
      if (!value) return null;
      return SEARCH_FIELDS.has(field)
        ? { field: field as NonNullable<SearchToken['field']>, value }
        : { field: null, value: part.toLowerCase() };
    })
    .filter((token): token is SearchToken => Boolean(token));
}

export function trimSearchValue(value: string): string {
  return value.trim().replace(/^"|"$/g, '').trim();
}

export function matchesSearch(job: SessionAutomationJob, tokens: SearchToken[], t: TFunction, locale: string): boolean {
  return tokens.every((token) => searchParts(job, token.field, t, locale)
    .some((part) => String(part ?? '').toLowerCase().includes(token.value)));
}

function searchParts(
  job: SessionAutomationJob,
  field: SearchToken['field'],
  t: TFunction,
  locale: string,
): Array<string | number | null | undefined> {
  const origin = job.origin;
  const originParts = origin ? [origin.session_key, origin.title, origin.preview, origin.channel, channelDisplayName(origin.channel, t)] : [];
  const scheduleParts: Array<string | number | null | undefined> = [
    job.schedule.kind,
    job.schedule.expr,
    job.schedule.tz,
    job.schedule.every_ms,
    job.schedule.at_ms,
    formatSchedule(job, t, locale),
  ];
  if (field === 'id') return [job.id];
  if (field === 'name') return [job.name];
  if (field === 'message') return [job.payload.message, job.payload.command, job.trigger?.command];
  if (field === 'chat') return originParts;
  if (field === 'cron' || field === 'schedule') return scheduleParts;
  if (field === 'status') return [automationStatusKey(job), automationStatus(job, t).label, job.enabled ? 'enabled' : 'disabled'];
  return [
    job.id,
    job.name,
    job.payload.message,
    job.payload.command,
    job.trigger?.command,
    isLocalTrigger(job) ? `trigger local ${t('settings.automations.localTrigger')}` : null,
    ...scheduleParts,
    automationStatusKey(job),
    automationStatus(job, t).label,
    ...originParts,
  ];
}

function channelDisplayName(channel: string, t: TFunction): string {
  const key = channel.trim().toLowerCase();
  if (key === 'websocket') return 'WebUI';
  if (AUTOMATION_CHANNELS.has(key)) return t(`settings.automations.channels.${key}`);
  return channel;
}

export function originLabel(job: SessionAutomationJob, t: TFunction): string {
  if (job.protected) return t('settings.automations.origin.system');
  const origin = job.origin;
  if (!origin) return t('settings.automations.origin.unknown');
  if (origin.channel !== 'websocket') return channelDisplayName(origin.channel, t);
  return origin.title || origin.preview || origin.session_key || channelDisplayName(origin.channel, t);
}

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
