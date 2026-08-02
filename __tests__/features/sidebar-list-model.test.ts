import { describe, expect, it } from 'vitest';

import type { SessionGroup } from '@/features/sidebar/chat-groups';
import { buildSidebarListItems, formatDuration } from '@/features/sidebar/sidebar-list-model';
import type { ChatSummary } from '@/types/api/sidebar';

function session(key: string): ChatSummary {
  return {
    key,
    channel: 'web',
    chatId: key,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    preview: key,
  };
}

describe('buildSidebarListItems', () => {
  it('keeps collapsed projects out of the session count and inserts the projects label once', () => {
    const groups: SessionGroup[] = [
      { id: 'workspace:chats', label: 'Chats', sessions: [session('chat-1')] },
      { id: 'project:a', label: 'A', kind: 'project', sessions: [session('project-1')] },
      { id: 'project:b', label: 'B', kind: 'project', sessions: [session('project-2')] },
    ];

    const items = buildSidebarListItems({
      groups,
      limitedGroups: groups,
      activeKey: null,
      collapsedGroups: { 'project:a': true },
    });

    expect(items.filter((item) => item.type === 'projects-label')).toHaveLength(1);
    expect(items.filter((item) => item.type === 'session').map((item) => item.session.key))
      .toEqual(['chat-1', 'project-2']);
    expect(items.some((item) => item.type === 'more')).toBe(false);
  });

  it('reports sessions hidden by the global visible limit', () => {
    const groups: SessionGroup[] = [
      { id: 'date:all', label: 'All', sessions: [session('one'), session('two'), session('three')] },
    ];
    const limitedGroups: SessionGroup[] = [
      { ...groups[0], sessions: groups[0].sessions.slice(0, 2) },
    ];

    const items = buildSidebarListItems({
      groups,
      limitedGroups,
      activeKey: null,
      collapsedGroups: { 'date:all': false },
    });

    expect(items.at(-1)).toEqual({ type: 'more', key: 'show-more', hiddenCount: 1, totalCount: 3 });
  });
});

describe('formatDuration', () => {
  it('uses the largest exact unit', () => {
    expect(formatDuration(7_200_000, 'en-US')).toContain('2');
    expect(formatDuration(90_000, 'en-US')).toContain('90');
  });
});
