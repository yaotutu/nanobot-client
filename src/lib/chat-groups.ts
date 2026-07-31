import { sessionTitle } from '@/lib/format';
import { normalizeWorkspacePath, projectNameFromPath, sameWorkspacePath } from '@/lib/workspace';
import type { ChatSummary, SidebarSortMode } from '@/types/nanobot';

export const COLLAPSED_CHATS_VISIBLE_COUNT = 8;

export interface SessionGroup {
  id: string;
  label: string;
  sessions: ChatSummary[];
  kind?: 'project';
  projectPath?: string;
  projectKey?: string;
  updatedAt?: string | null;
}

export interface ChatGroupLabels {
  pinned: string;
  all: string;
  today: string;
  yesterday: string;
  earlier: string;
  archived: string;
}

interface ChatGroupingOptions {
  pinnedKeys: string[];
  archivedKeys: string[];
  titleOverrides: Record<string, string>;
  projectNameOverrides: Record<string, string>;
  showArchived: boolean;
  sort: SidebarSortMode;
  defaultWorkspacePath?: string | null;
}

export function groupSessions(
  sessions: ChatSummary[],
  labels: ChatGroupLabels,
  options: ChatGroupingOptions,
): SessionGroup[] {
  if (sessions.some((session) => session.workspaceScope?.project_path)) {
    return groupSessionsByProject(sessions, labels, options);
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const buckets = new Map<string, ChatSummary[]>();
  const pinned = new Set(options.pinnedKeys);
  const archived = new Set(options.archivedKeys);
  const pinnedSessions: ChatSummary[] = [];
  const archivedSessions: ChatSummary[] = [];
  const normalSessions: ChatSummary[] = [];

  for (const session of sessions) {
    if (archived.has(session.key)) {
      if (options.showArchived) archivedSessions.push(session);
      continue;
    }
    if (pinned.has(session.key)) {
      pinnedSessions.push(session);
      continue;
    }
    if (options.sort === 'title_asc') {
      normalSessions.push(session);
      continue;
    }
    const timestamp = Date.parse(session.updatedAt ?? session.createdAt ?? '');
    const label = Number.isFinite(timestamp) && timestamp >= startOfToday
      ? labels.today
      : Number.isFinite(timestamp) && timestamp >= startOfYesterday
        ? labels.yesterday
        : labels.earlier;
    const bucket = buckets.get(label) ?? [];
    bucket.push(session);
    buckets.set(label, bucket);
  }

  const groups: SessionGroup[] = [labels.today, labels.yesterday, labels.earlier]
    .map((label) => ({
      id: `date:${label}`,
      label,
      sessions: sortSessions(buckets.get(label) ?? [], options.sort, options.titleOverrides),
    }))
    .filter((group) => group.sessions.length > 0);

  if (options.sort === 'title_asc' && normalSessions.length) {
    groups.push({
      id: 'date:all',
      label: labels.all,
      sessions: sortSessions(normalSessions, options.sort, options.titleOverrides),
    });
  }
  if (pinnedSessions.length) {
    groups.unshift({
      id: 'pinned',
      label: labels.pinned,
      sessions: sortSessions(pinnedSessions, options.sort, options.titleOverrides),
    });
  }
  if (archivedSessions.length) {
    groups.push({
      id: 'archived',
      label: labels.archived,
      sessions: sortSessions(archivedSessions, options.sort, options.titleOverrides),
    });
  }
  return groups;
}

export function limitGroups(
  groups: SessionGroup[],
  limit: number,
  activeKey: string | null,
  collapsedGroups: Record<string, boolean>,
): SessionGroup[] {
  let remaining = Math.max(0, limit);
  let activeVisible = !activeKey;
  const output: SessionGroup[] = [];

  for (const group of groups) {
    if (isCollapsedProject(group, collapsedGroups)) {
      output.push({ ...group, sessions: [] });
      continue;
    }
    const visible = remaining > 0 ? group.sessions.slice(0, remaining) : [];
    remaining -= visible.length;
    if (activeKey && visible.some((session) => session.key === activeKey)) activeVisible = true;
    if (visible.length > 0) output.push({ ...group, sessions: visible });
  }

  if (activeVisible || !activeKey) return output;
  for (const group of groups) {
    if (isCollapsedProject(group, collapsedGroups)) continue;
    const active = group.sessions.find((session) => session.key === activeKey);
    if (!active) continue;
    const existing = output.find((item) => item.id === group.id);
    if (existing) existing.sessions = [...existing.sessions, active];
    else output.push({ ...group, sessions: [active] });
    return output;
  }
  return output;
}

export function isCollapsedProject(
  group: SessionGroup,
  collapsedGroups: Record<string, boolean>,
): boolean {
  return group.kind === 'project' && Boolean(collapsedGroups[group.id]);
}

export function isFoldableChatsGroup(group: SessionGroup): boolean {
  return group.id === 'workspace:chats' || group.id === 'date:all';
}

export function isFoldedChatsGroup(
  group: SessionGroup,
  collapsedGroups: Record<string, boolean>,
): boolean {
  return isFoldableChatsGroup(group)
    && group.sessions.length > COLLAPSED_CHATS_VISIBLE_COUNT
    && collapsedGroups[group.id] !== false;
}

export function visibleSessionsForGroup(
  group: SessionGroup,
  activeKey: string | null,
  collapsedGroups: Record<string, boolean>,
): ChatSummary[] {
  if (!isFoldedChatsGroup(group, collapsedGroups)) return group.sessions;
  const visible = group.sessions.slice(0, COLLAPSED_CHATS_VISIBLE_COUNT);
  if (!activeKey || visible.some((session) => session.key === activeKey)) return visible;
  const active = group.sessions.find((session) => session.key === activeKey);
  return active ? [...visible, active] : visible;
}

function groupSessionsByProject(
  sessions: ChatSummary[],
  labels: Pick<ChatGroupLabels, 'all'>,
  options: ChatGroupingOptions,
): SessionGroup[] {
  const archived = new Set(options.archivedKeys);
  const conversations: ChatSummary[] = [];
  const buckets = new Map<string, {
    path?: string;
    label: string;
    sessions: ChatSummary[];
    updatedAt: string | null;
  }>();

  for (const session of sessions) {
    if (archived.has(session.key) && !options.showArchived) continue;
    const scope = session.workspaceScope;
    const path = scope?.project_path || '';
    if (!path || sameWorkspacePath(path, options.defaultWorkspacePath)) {
      conversations.push(session);
      continue;
    }
    const key = normalizeWorkspacePath(path);
    const label = options.projectNameOverrides[key]?.trim()
      || scope?.project_name?.trim()
      || projectNameFromPath(path);
    const bucket = buckets.get(key) ?? { path, label, sessions: [], updatedAt: null };
    bucket.sessions.push(session);
    const candidate = session.updatedAt ?? session.createdAt ?? null;
    if (dateToTime(candidate) > dateToTime(bucket.updatedAt)) bucket.updatedAt = candidate;
    buckets.set(key, bucket);
  }

  const pinned = new Set(options.pinnedKeys);
  const groups: SessionGroup[] = Array.from(buckets.entries()).map(([key, bucket]) => ({
    id: `project:${key}`,
    label: bucket.label,
    kind: 'project' as const,
    projectPath: bucket.path,
    projectKey: key,
    updatedAt: bucket.updatedAt,
    sessions: sortProjectSessions(
      bucket.sessions,
      options.sort,
      options.titleOverrides,
      pinned,
      archived,
    ),
  }));

  if (conversations.length) {
    const updatedAt = conversations.reduce<string | null>((best, session) => {
      const candidate = session.updatedAt ?? session.createdAt ?? null;
      return dateToTime(candidate) > dateToTime(best) ? candidate : best;
    }, null);
    groups.push({
      id: 'workspace:chats',
      label: labels.all,
      updatedAt,
      sessions: sortProjectSessions(
        conversations,
        options.sort,
        options.titleOverrides,
        pinned,
        archived,
      ),
    });
  }

  groups.sort((left, right) => {
    const timeOrder = dateToTime(right.updatedAt) - dateToTime(left.updatedAt);
    if (timeOrder !== 0) return timeOrder;
    return left.label.localeCompare(right.label, 'zh-CN', { numeric: true, sensitivity: 'base' });
  });
  return groups;
}

function sortProjectSessions(
  sessions: ChatSummary[],
  sort: SidebarSortMode,
  titleOverrides: Record<string, string>,
  pinned: Set<string>,
  archived: Set<string>,
): ChatSummary[] {
  return sortSessions(sessions, sort, titleOverrides).sort((left, right) => {
    const pinOrder = Number(pinned.has(right.key)) - Number(pinned.has(left.key));
    if (pinOrder !== 0) return pinOrder;
    return Number(archived.has(left.key)) - Number(archived.has(right.key));
  });
}

function sortSessions(
  sessions: ChatSummary[],
  sort: SidebarSortMode,
  titleOverrides: Record<string, string>,
): ChatSummary[] {
  return [...sessions].sort((left, right) => {
    if (sort === 'title_asc') {
      const titleOrder = titleForSort(left, titleOverrides).localeCompare(
        titleForSort(right, titleOverrides),
        'zh-CN',
        { numeric: true, sensitivity: 'base' },
      );
      if (titleOrder !== 0) return titleOrder;
      return sessionTime(right, 'updatedAt') - sessionTime(left, 'updatedAt');
    }
    const field = sort === 'created_desc' ? 'createdAt' : 'updatedAt';
    return sessionTime(right, field) - sessionTime(left, field);
  });
}

function titleForSort(session: ChatSummary, titleOverrides: Record<string, string>): string {
  return (titleOverrides[session.key]?.trim() || sessionTitle(session)).toLocaleLowerCase('zh-CN');
}

function sessionTime(session: ChatSummary, field: 'createdAt' | 'updatedAt'): number {
  return dateToTime(session[field]);
}

function dateToTime(value: string | null | undefined): number {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}
