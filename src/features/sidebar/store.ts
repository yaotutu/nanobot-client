import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import i18n from '@/i18n';
import type {
  ChatSummary,
  SidebarStatePayload,
} from '@/types/api/sidebar';

import {
  deleteSession as apiDeleteSession,
  fetchSidebarState as apiFetchSidebarState,
  fetchSessionAutomations as apiFetchSessionAutomations,
  listSessions as apiListSessions,
  updateSidebarState as apiUpdateSidebarState,
} from './api';

/**
 * Sidebar store —— 会话列表 + sidebar 状态（pinned / archived / title overrides / 折叠组）。
 *
 * 旧应用控制器 中散落在多个 ref / state 里的 sidebar 行为在此收敛：
 *   - sidebarStateRef
 *   - sidebarMutationVersionRef
 *   - updateSidebar / togglePinned / toggleArchived / renameSession / renameProject /
 *     setShowArchived / toggleSidebarGroup / removeSession
 */
interface SidebarState {
  sessions: ChatSummary[];
  sidebarState: SidebarStatePayload;
  loading: boolean;
  /** 等待中的 mutations（用于 UI 禁用按钮） */
  pending: Set<string>;
}

interface SidebarActions {
  refresh(): Promise<void>;
  refreshSidebarState(): Promise<void>;
  togglePinned(key: string): Promise<void>;
  toggleArchived(key: string): Promise<void>;
  toggleGroup(groupId: string): Promise<void>;
  renameSession(key: string, title: string): Promise<void>;
  renameProject(projectKey: string, title: string): Promise<void>;
  setShowArchived(show: boolean): Promise<void>;
  removeSession(
    key: string,
    options?: { deleteAutomations?: boolean },
  ): Promise<{ deleted: boolean }>;
  getSessionAutomations(key: string): Promise<unknown[]>;
  /** 给新会话添加一个乐观条目（fork / sendMessage 中用到） */
  addOptimistic(session: ChatSummary): void;
  /** 替换 sessions（force-overwrite） */
  setSessions(sessions: ChatSummary[]): void;
  /** logout 时清空 */
  resetAll(): void;
}

export type SidebarStore = SidebarState & SidebarActions;

const DEFAULT_SIDEBAR_STATE: SidebarStatePayload = {
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

function toggleInSet(list: string[], key: string, present: boolean): string[] {
  const set = new Set(list);
  if (present) set.delete(key);
  else set.add(key);
  return [...set];
}

export const useSidebarStore = create<SidebarStore>()(
  subscribeWithSelector((set, get) => {
    async function mutateSidebar(
      updater: (current: SidebarStatePayload) => SidebarStatePayload,
    ): Promise<void> {
      const next = updater(get().sidebarState);
      set({ sidebarState: next });
      try {
        const persisted = await apiUpdateSidebarState(next);
        set({ sidebarState: persisted });
      } catch (caught) {
        const message = caught instanceof Error
          ? caught.message
          : i18n.t('sidebar.saveStateFailed', { defaultValue: 'Could not save sidebar state' });
        set({ error: message } as Partial<SidebarState>);
        // 不抛 —— sidebar state 失败不应阻塞聊天
      }
    }

    return {
      sessions: [],
      sidebarState: DEFAULT_SIDEBAR_STATE,
      loading: false,
      pending: new Set<string>(),

      async refresh() {
        set({ loading: true });
        try {
          const sessions = await apiListSessions();
          set({ sessions, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      async refreshSidebarState() {
        try {
          const state = await apiFetchSidebarState();
          set({ sidebarState: state });
        } catch {
          // sidebar state 缺失时不影响功能
        }
      },

      async togglePinned(key) {
        const set2 = new Set(get().pending);
        set2.add(key);
        set({ pending: set2 });
        try {
          await mutateSidebar((current) => {
            const present = current.pinned_keys.includes(key);
            return { ...current, pinned_keys: toggleInSet(current.pinned_keys, key, present) };
          });
        } finally {
          const s = new Set(get().pending);
          s.delete(key);
          set({ pending: s });
        }
      },

      async toggleArchived(key) {
        const s = new Set(get().pending);
        s.add(key);
        set({ pending: s });
        try {
          await mutateSidebar((current) => {
            const present = current.archived_keys.includes(key);
            const archived = toggleInSet(current.archived_keys, key, present);
            const pinned = present
              ? current.pinned_keys.filter((k) => k !== key)
              : current.pinned_keys;
            return { ...current, archived_keys: archived, pinned_keys: pinned };
          });
        } finally {
          const s2 = new Set(get().pending);
          s2.delete(key);
          set({ pending: s2 });
        }
      },

      async toggleGroup(groupId) {
        await mutateSidebar((current) => ({
          ...current,
          collapsed_groups: {
            ...current.collapsed_groups,
            [groupId]: !current.collapsed_groups[groupId],
          },
        }));
      },

      async renameSession(key, rawTitle) {
        const title = rawTitle.trim();
        await mutateSidebar((current) => {
          const title_overrides = { ...current.title_overrides };
          if (title) title_overrides[key] = title;
          else delete title_overrides[key];
          return { ...current, title_overrides };
        });
      },

      async renameProject(projectKey, rawTitle) {
        const title = rawTitle.trim();
        await mutateSidebar((current) => {
          const project_name_overrides = { ...current.project_name_overrides };
          if (title) project_name_overrides[projectKey] = title;
          else delete project_name_overrides[projectKey];
          return { ...current, project_name_overrides };
        });
      },

      async setShowArchived(show) {
        await mutateSidebar((current) => ({
          ...current,
          view: { ...current.view, show_archived: show },
        }));
      },

      async removeSession(key, options) {
        try {
          const result = await apiDeleteSession(key, options);
          if (!result.deleted) return { deleted: false };
          set((s) => ({ sessions: s.sessions.filter((sess) => sess.key !== key) }));
          await mutateSidebar((current) => {
            const title_overrides = { ...current.title_overrides };
            const project_name_overrides = { ...current.project_name_overrides };
            const tags_by_key = { ...current.tags_by_key };
            delete title_overrides[key];
            delete project_name_overrides[key];
            delete tags_by_key[key];
            return {
              ...current,
              pinned_keys: current.pinned_keys.filter((k) => k !== key),
              archived_keys: current.archived_keys.filter((k) => k !== key),
              title_overrides,
              project_name_overrides,
              tags_by_key,
            };
          });
          return { deleted: true };
        } catch {
          return { deleted: false };
        }
      },

      async getSessionAutomations(key) {
        try {
          const payload = await apiFetchSessionAutomations(key);
          return payload.jobs;
        } catch {
          return [];
        }
      },

      addOptimistic(session) {
        set((s) => ({
          sessions: [session, ...s.sessions.filter((sess) => sess.key !== session.key)],
        }));
      },

      setSessions(sessions) {
        set({ sessions });
      },

      resetAll() {
        set({
          sessions: [],
          sidebarState: DEFAULT_SIDEBAR_STATE,
          loading: false,
          pending: new Set<string>(),
        });
      },
    };
  }),
);

export const selectSessions = (s: SidebarStore) => s.sessions;
export const selectSidebarState = (s: SidebarStore) => s.sidebarState;
