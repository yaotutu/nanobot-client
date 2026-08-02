import type { TFunction } from 'i18next';

import {
  COLLAPSED_CHATS_VISIBLE_COUNT,
  isCollapsedProject,
  isFoldableChatsGroup,
  isFoldedChatsGroup,
  visibleSessionsForGroup,
  type SessionGroup,
} from '@/features/sidebar/chat-groups';
import { formatDateTime, safeNumberFormat } from '@/services/text/format';
import type { SessionAutomationJob } from '@/types/api/automations';
import type { ChatSummary } from '@/types/api/sidebar';

export type SidebarListItem =
  | { type: 'projects-label'; key: string }
  | { type: 'group'; key: string; group: SessionGroup }
  | { type: 'session'; key: string; group: SessionGroup; session: ChatSummary }
  | { type: 'fold'; key: string; groupId: string; folded: boolean; hiddenCount: number }
  | { type: 'more'; key: string; hiddenCount: number; totalCount: number };

export function buildSidebarListItems(options: {
  groups: SessionGroup[];
  limitedGroups: SessionGroup[];
  activeKey: string | null;
  collapsedGroups: Record<string, boolean>;
}): SidebarListItem[] {
  const { groups, limitedGroups, activeKey, collapsedGroups } = options;
  const totalSessionCount = groups.reduce(
    (total, group) => total + (isCollapsedProject(group, collapsedGroups) ? 0 : group.sessions.length),
    0,
  );
  const items: SidebarListItem[] = [];
  const firstProjectIndex = limitedGroups.findIndex((group) => group.kind === 'project');
  let visibleSessionCount = 0;

  limitedGroups.forEach((group, index) => {
    if (index === firstProjectIndex) items.push({ type: 'projects-label', key: 'projects-label' });
    items.push({ type: 'group', key: `group:${group.id}`, group });
    if (group.kind === 'project' && collapsedGroups[group.id]) return;

    const visibleSessions = visibleSessionsForGroup(group, activeKey, collapsedGroups);
    visibleSessionCount += group.sessions.length;
    for (const session of visibleSessions) {
      items.push({ type: 'session', key: `session:${session.key}`, group, session });
    }
    if (isFoldableChatsGroup(group) && group.sessions.length > COLLAPSED_CHATS_VISIBLE_COUNT) {
      items.push({
        type: 'fold',
        key: `fold:${group.id}`,
        groupId: group.id,
        folded: isFoldedChatsGroup(group, collapsedGroups),
        hiddenCount: Math.max(0, group.sessions.length - visibleSessions.length),
      });
    }
  });

  const hiddenCount = Math.max(0, totalSessionCount - visibleSessionCount);
  if (hiddenCount > 0) {
    items.push({ type: 'more', key: 'show-more', hiddenCount, totalCount: totalSessionCount });
  }
  return items;
}

export function automationDeleteSummary(
  jobs: SessionAutomationJob[],
  t: TFunction,
  locale: string,
): string {
  const visible = jobs.slice(0, 4).map((job) => {
    const schedule = automationScheduleLabel(job, t, locale);
    const next = automationNextRunLabel(job, t);
    return `• ${job.name || job.id}\n  ${schedule} · ${next}`;
  });
  const hiddenCount = Math.max(0, jobs.length - visible.length);
  if (hiddenCount > 0) visible.push(t('deleteConfirm.moreAutomations', { count: hiddenCount }));
  return visible.join('\n');
}

export function automationScheduleLabel(job: SessionAutomationJob, t: TFunction, locale: string): string {
  if (job.schedule.kind === 'at' && job.schedule.at_ms) return formatDateTime(job.schedule.at_ms);
  if (job.schedule.kind === 'every' && job.schedule.every_ms) {
    return t('deleteConfirm.schedule.every', { duration: formatDuration(job.schedule.every_ms, locale) });
  }
  if (job.schedule.kind === 'cron' && job.schedule.expr) {
    return job.schedule.tz
      ? t('deleteConfirm.schedule.cronWithTz', { expr: job.schedule.expr, tz: job.schedule.tz })
      : t('deleteConfirm.schedule.cron', { expr: job.schedule.expr });
  }
  if (job.schedule.kind === 'local' || job.payload.kind === 'local_trigger') return t('deleteConfirm.schedule.local');
  return t('deleteConfirm.schedule.unknown');
}

export function automationNextRunLabel(job: SessionAutomationJob, t: TFunction): string {
  if (!job.enabled) return t('deleteConfirm.next.disabled');
  if (job.schedule.kind === 'local' || job.payload.kind === 'local_trigger') return t('deleteConfirm.next.local');
  return job.state.next_run_at_ms
    ? t('deleteConfirm.next.label', { time: formatDateTime(job.state.next_run_at_ms) })
    : t('deleteConfirm.next.none');
}

export function formatDuration(ms: number, locale: string): string {
  const units: Array<[Intl.NumberFormatOptions['unit'], number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
  ];
  for (const [unit, size] of units) {
    if (ms >= size && ms % size === 0) {
      return safeNumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(ms / size);
    }
  }
  return safeNumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' })
    .format(Math.round(ms / 6_000) / 10);
}
