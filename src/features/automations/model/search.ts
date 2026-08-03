import type { TFunction } from 'i18next';

import type { SessionAutomationJob } from '@/types/api/automations';

import { formatSchedule } from './schedule';
import {
  automationStatus,
  automationStatusKey,
  isLocalTrigger,
} from './status';
import type { AutomationSort, SearchToken } from './types';

export const SEARCH_FIELDS = new Set(['id', 'name', 'message', 'chat', 'cron', 'schedule', 'status']);
export const AUTOMATION_CHANNELS = new Set([
  'api', 'cli', 'dingtalk', 'discord', 'email', 'feishu', 'matrix', 'msteams', 'qq', 'slack',
  'telegram', 'wechat', 'wecom', 'weixin', 'whatsapp',
]);

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

