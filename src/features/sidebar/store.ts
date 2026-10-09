import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import i18n from '@/i18n';
import type { SessionDeleteResult } from '@/types/api/chat/thread';
import type {
  ChatSummary,
  SidebarStatePayload,
} from '@/types/api/sidebar';

import {
  deleteSession as apiDeleteSession,
  fetchSidebarState as apiFetchSidebarState,
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
  error: string | null;
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
  ): Promise<SessionDeleteResult>;
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
    // 每次 reset 都开启新环境；请求与 pending 清理仅能修改发起时的环境。
    let generation = 0;
    let refreshSequence = 0;
    let mutationVersion = 0;
    let writeQueue: Promise<void> = Promise.resolve();

    async function mutateSidebar(
      updater: (current: SidebarStatePayload) => SidebarStatePayload,
    ): Promise<void> {
      const requestGeneration = generation;
      const requestVersion = ++mutationVersion;
      const next = updater(get().sidebarState);
      // 立即展示操作后的完整快照；排队期间后续操作仍从最新乐观状态计算。
      set({ sidebarState: next });
      const task = writeQueue.then(async () => {
        // 尚未发送的旧环境快照直接失效，不能用新环境的连接继续保存。
        if (requestGeneration !== generation) return;
        try {
          const persisted = await apiUpdateSidebarState(next);
          // 旧响应不能覆盖后续操作的乐观状态，也不能回写 reset 后的新环境。
          if (requestGeneration === generation && requestVersion === mutationVersion) {
            set({ sidebarState: persisted });
          }
        } catch (caught) {
          if (requestGeneration !== generation) return;
          const message = caught instanceof Error
            ? caught.message
            : i18n.t('sidebar.saveStateFailed', { defaultValue: 'Could not save sidebar state' });
          set({ error: message });
          // 不抛 —— sidebar state 失败不应阻塞聊天或后续排队的保存。
        }
      });
      // 队尾始终恢复为可继续的 Promise；单个任务失败不会阻断后续发送。
      writeQueue = task.catch(() => {});
      await task;
    }

    return {
      sessions: [],
      sidebarState: DEFAULT_SIDEBAR_STATE,
      loading: false,
      error: null,
      pending: new Set<string>(),

      async refresh() {
        const requestGeneration = generation;
        const requestId = ++refreshSequence;
        set({ loading: true });
        try {
          const sessions = await apiListSessions();
          // 只允许当前环境最新一次刷新回写，避免启动请求和打开面板请求乱序覆盖。
          if (requestGeneration === generation && requestId === refreshSequence) {
            set({ sessions, loading: false, error: null });
          }
        } catch {
          if (requestGeneration === generation && requestId === refreshSequence) {
            set({ loading: false });
          }
        }
      },

      async refreshSidebarState() {
        const requestGeneration = generation;
        try {
          const state = await apiFetchSidebarState();
          if (requestGeneration === generation) set({ sidebarState: state });
        } catch {
          // sidebar state 缺失时不影响功能
        }
      },

      async togglePinned(key) {
        const requestGeneration = generation;
        const set2 = new Set(get().pending);
        set2.add(key);
        set({ pending: set2 });
        try {
          await mutateSidebar((current) => {
            const present = current.pinned_keys.includes(key);
            return { ...current, pinned_keys: toggleInSet(current.pinned_keys, key, present) };
          });
        } finally {
          // 新环境可能已对相同 key 发起操作，旧任务不能替它解除 pending。
          if (requestGeneration === generation) {
            const s = new Set(get().pending);
            s.delete(key);
            set({ pending: s });
          }
        }
      },

      async toggleArchived(key) {
        const requestGeneration = generation;
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
          if (requestGeneration === generation) {
            const s2 = new Set(get().pending);
            s2.delete(key);
            set({ pending: s2 });
          }
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

      async removeSession(key) {
        const requestGeneration = generation;
        try {
          const result = await apiDeleteSession(key);
          // 保留删除接口的原始结果，但旧环境删除不能清理新环境同 key 的会话或元数据。
          if (requestGeneration !== generation) return result;
          if (!result.deleted) return result;
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
        } catch (error: unknown) {
          if (requestGeneration === generation) {
            set({ error: error instanceof Error ? error.message : i18n.t('settings.status.loadError') });
          }
          throw error;
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
        generation += 1;
        refreshSequence += 1;
        // 新环境不等待旧请求结束；旧队列仍会自行完成，但发送前检查会跳过旧任务。
        writeQueue = Promise.resolve();
        set({
          sessions: [],
          sidebarState: DEFAULT_SIDEBAR_STATE,
          loading: false,
          error: null,
          pending: new Set<string>(),
        });
      },
    };
  }),
);

export const selectSessions = (s: SidebarStore) => s.sessions;
export const selectSidebarState = (s: SidebarStore) => s.sidebarState;
