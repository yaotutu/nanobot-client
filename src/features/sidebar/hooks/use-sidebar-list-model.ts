import { useMemo, useState } from 'react';

import { groupSessions, limitGroups, type ChatGroupLabels } from '@/features/sidebar/chat-groups';
import { buildSidebarListItems } from '@/features/sidebar/sidebar-list-model';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';

const INITIAL_VISIBLE_SESSIONS = 160;
const VISIBLE_SESSIONS_INCREMENT = 160;

export function useSidebarListModel(options: {
  sessions: ChatSummary[];
  state: SidebarStatePayload;
  activeKey: string | null;
  defaultWorkspacePath?: string | null;
  labels: ChatGroupLabels;
}) {
  const { sessions, state, activeKey, defaultWorkspacePath, labels } = options;
  const viewKey = `${state.view.show_archived}:${state.view.sort}`;
  const [visibleLimitState, setVisibleLimitState] = useState({
    key: viewKey,
    limit: INITIAL_VISIBLE_SESSIONS,
  });
  const visibleLimit = visibleLimitState.key === viewKey
    ? visibleLimitState.limit
    : INITIAL_VISIBLE_SESSIONS;

  const groups = useMemo(() => groupSessions(sessions, labels, {
    pinnedKeys: state.pinned_keys,
    archivedKeys: state.archived_keys,
    titleOverrides: state.title_overrides,
    projectNameOverrides: state.project_name_overrides,
    showArchived: state.view.show_archived,
    sort: state.view.sort,
    defaultWorkspacePath,
  }), [defaultWorkspacePath, labels, sessions, state]);

  const limitedGroups = useMemo(
    () => limitGroups(groups, visibleLimit, activeKey, state.collapsed_groups),
    [activeKey, groups, state.collapsed_groups, visibleLimit],
  );

  const items = useMemo(() => buildSidebarListItems({
    groups,
    limitedGroups,
    activeKey,
    collapsedGroups: state.collapsed_groups,
  }), [activeKey, groups, limitedGroups, state.collapsed_groups]);

  return {
    items,
    showMore(totalCount: number) {
      setVisibleLimitState({
        key: viewKey,
        limit: Math.min(totalCount, visibleLimit + VISIBLE_SESSIONS_INCREMENT),
      });
    },
  };
}
