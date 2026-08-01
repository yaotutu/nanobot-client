import { describe, expect, it } from 'vitest';

import { groupSessions } from '@/features/sidebar/chat-groups';
import type { ChatSummary, SidebarStatePayload } from '@/types/api';

const labels = {
  pinned: '置顶',
  all: '全部',
  today: '今天',
  yesterday: '昨天',
  earlier: '更早',
  archived: '已归档',
};

function makeSession(overrides: Partial<ChatSummary>): ChatSummary {
  return {
    key: `ws:${overrides.chatId ?? '1'}`,
    channel: 'ws',
    chatId: '1',
    createdAt: null,
    updatedAt: null,
    title: '',
    preview: '',
    ...overrides,
  };
}

describe('groupSessions', () => {
  it('returns empty array when no sessions', () => {
    expect(groupSessions([], labels, defaultOptions())).toEqual([]);
  });

  it('separates pinned, archived, and normal sessions', () => {
    const sessions = [
      makeSession({ key: 'ws:p', chatId: 'p', updatedAt: '2024-01-01T00:00:00Z' }),
      makeSession({ key: 'ws:a', chatId: 'a', updatedAt: '2024-01-01T00:00:00Z' }),
      makeSession({ key: 'ws:n', chatId: 'n', updatedAt: '2024-01-01T00:00:00Z' }),
    ];
    const out = groupSessions(sessions, labels, {
      ...defaultOptions(),
      pinnedKeys: ['ws:p'],
      archivedKeys: ['ws:a'],
      showArchived: false,
    });
    const ids = out.map((g) => g.id);
    expect(ids).toContain('pinned');
    expect(ids).not.toContain('archived');
  });

  it('shows archived when showArchived is true', () => {
    const sessions = [makeSession({ key: 'ws:a', chatId: 'a', updatedAt: '2024-01-01T00:00:00Z' })];
    const out = groupSessions(sessions, labels, {
      ...defaultOptions(),
      archivedKeys: ['ws:a'],
      showArchived: true,
    });
    expect(out.some((g) => g.id === 'archived')).toBe(true);
  });

  it('buckets by date buckets when no workspace scope', () => {
    const today = new Date();
    const todayIso = today.toISOString();
    const oldIso = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const sessions = [
      makeSession({ key: 'ws:1', chatId: '1', updatedAt: todayIso }),
      makeSession({ key: 'ws:2', chatId: '2', updatedAt: oldIso }),
    ];
    const out = groupSessions(sessions, labels, defaultOptions());
    const todayGroup = out.find((g) => g.id === 'date:今天');
    const earlierGroup = out.find((g) => g.id === 'date:更早');
    expect(todayGroup?.sessions.length).toBe(1);
    expect(earlierGroup?.sessions.length).toBe(1);
  });

  it('uses title_asc sort when specified', () => {
    const sessions = [
      makeSession({ key: 'ws:c', chatId: 'c', title: 'Charlie' }),
      makeSession({ key: 'ws:a', chatId: 'a', title: 'Alpha' }),
      makeSession({ key: 'ws:b', chatId: 'b', title: 'Bravo' }),
    ];
    const out = groupSessions(sessions, labels, { ...defaultOptions(), sort: 'title_asc' });
    const all = out.find((g) => g.id === 'date:all');
    expect(all?.sessions.map((s) => s.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });
});

function defaultOptions() {
  const state: SidebarStatePayload = {
    schema_version: 1,
    pinned_keys: [],
    archived_keys: [],
    title_overrides: {},
    project_name_overrides: {},
    tags_by_key: {},
    collapsed_groups: {},
    view: {
      density: 'comfortable',
      show_previews: false,
      show_timestamps: false,
      show_archived: false,
      sort: 'updated_desc',
    },
  };
  return {
    pinnedKeys: state.pinned_keys,
    archivedKeys: state.archived_keys,
    titleOverrides: state.title_overrides,
    projectNameOverrides: state.project_name_overrides,
    showArchived: state.view.show_archived,
    sort: state.view.sort,
  };
}
