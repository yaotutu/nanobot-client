import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import i18n from '@/i18n';
import type { WorkspacesPayload } from '@/types/api/workspaces';

import { fetchWorkspaces } from './api';

interface WorkspacesState {
  workspaces: WorkspacesPayload | null;
  error: string | null;
  loading: boolean;
}

interface WorkspacesActions {
  refresh(): Promise<void>;
  resetAll(): void;
}

export type WorkspacesStore = WorkspacesState & WorkspacesActions;

// 刷新和 reset 共用代次：只允许最新环境的最新请求写回，避免旧服务器的目录重新出现。
let refreshSequence = 0;

export const useWorkspacesStore = create<WorkspacesStore>()(
  subscribeWithSelector((set) => ({
    workspaces: null,
    error: null,
    loading: false,

    async refresh() {
      const requestId = ++refreshSequence;
      set({ loading: true });
      try {
        const workspaces = await fetchWorkspaces();
        if (requestId !== refreshSequence) return;
        set({ workspaces, loading: false, error: null });
      } catch (caught) {
        if (requestId !== refreshSequence) return;
        const error = caught instanceof Error
          ? caught.message
          : i18n.t('app.error.gatewayHint');
        set({ loading: false, error });
      }
    },

    resetAll() {
      refreshSequence += 1;
      set({ workspaces: null, error: null, loading: false });
    },
  })),
);

export const selectWorkspaces = (s: WorkspacesStore) => s.workspaces;
