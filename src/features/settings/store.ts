import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { SettingsPayload } from '@/types/api';

import { fetchSettings, fetchSettingsUsage } from './api';

interface SettingsState {
  settings: SettingsPayload | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

interface SettingsActions {
  refresh(refresh?: boolean): Promise<void>;
  applySettings(payload: SettingsPayload): void;
  refreshUsage(): Promise<void>;
  resetAll(): void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>()(
  subscribeWithSelector((set) => ({
    settings: null,
    loading: false,
    refreshing: false,
    error: null,

    async refresh(refresh = false) {
      if (refresh) set({ refreshing: true });
      else set({ loading: true });
      try {
        const settings = await fetchSettings();
        set({ settings, loading: false, refreshing: false, error: null });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Failed to load settings';
        set({ error: message, loading: false, refreshing: false });
      }
    },

    applySettings(payload) {
      set({ settings: payload });
    },

    async refreshUsage() {
      try {
        const usage = await fetchSettingsUsage();
        set((s) => (s.settings ? { settings: { ...s.settings, usage } } : s));
      } catch {
        // usage 是 best-effort
      }
    },

    resetAll() {
      set({ settings: null, loading: false, refreshing: false, error: null });
    },
  })),
);

export const selectSettings = (s: SettingsStore) => s.settings;
