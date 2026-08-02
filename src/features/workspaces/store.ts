import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import i18n from '@/i18n';
import type { WorkspacesPayload } from '@/types/api';

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

export const useWorkspacesStore = create<WorkspacesStore>()(
  subscribeWithSelector((set) => ({
    workspaces: null,
    error: null,
    loading: false,

    async refresh() {
      set({ loading: true });
      try {
        const workspaces = await fetchWorkspaces();
        set({ workspaces, loading: false, error: null });
      } catch (caught) {
        const error = caught instanceof Error
          ? caught.message
          : i18n.t('app.error.gatewayHint');
        set({ loading: false, error });
      }
    },

    resetAll() {
      set({ workspaces: null, error: null, loading: false });
    },
  })),
);

export const selectWorkspaces = (s: WorkspacesStore) => s.workspaces;
