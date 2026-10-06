import {
  COLLAPSED_CHATS_VISIBLE_COUNT,
  isCollapsedProject,
  isFoldableChatsGroup,
  isFoldedChatsGroup,
  visibleSessionsForGroup,
  type SessionGroup,
} from '@/features/sidebar/chat-groups';
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
