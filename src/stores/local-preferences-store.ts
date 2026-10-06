import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { normalizeLocale, resolveDeviceLocale } from '@/i18n/config';
import type { AppLanguage, AppTheme } from '@/types/domain';

export interface LocalPreferences {
  theme: AppTheme;
  language: AppLanguage;
}

const STORAGE_KEY = 'nanobot-native.local-preferences';

export const DEFAULT_LOCAL_PREFS: LocalPreferences = {
  theme: 'light',
  language: resolveDeviceLocale(),
};

function normalize(raw: unknown): LocalPreferences {
  const value = raw && typeof raw === 'object' ? (raw as Partial<LocalPreferences>) : {};
  // 显式构造当前偏好，统一规范化主题与语言，确保内存状态和持久化内容只含这两个字段。
  return {
    theme: value.theme === 'dark' ? 'dark' : 'light',
    language: normalizeLocale(value.language),
  };
}

export interface LocalPreferencesState {
  preferences: LocalPreferences;
  hydrated: boolean;
  hydrate(): Promise<void>;
  replace(preferences: LocalPreferences): void;
  update(patch: Partial<LocalPreferences>): void;
}

async function readStorage(): Promise<LocalPreferences> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_PREFS;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_LOCAL_PREFS;
  }
}

async function writeStorage(preferences: LocalPreferences): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are best-effort; the in-memory state remains authoritative.
  }
}

let hydrationPromise: Promise<void> | null = null;

export const useLocalPreferencesStore = create<LocalPreferencesState>()(
  subscribeWithSelector((set, get) => ({
    preferences: DEFAULT_LOCAL_PREFS,
    hydrated: false,

    hydrate() {
      if (get().hydrated) return Promise.resolve();
      if (hydrationPromise) return hydrationPromise;
      hydrationPromise = readStorage()
        .then((preferences) => set({ preferences, hydrated: true }))
        .finally(() => {
          hydrationPromise = null;
        });
      return hydrationPromise;
    },

    replace(preferences) {
      const next = normalize(preferences);
      set({ preferences: next, hydrated: true });
      void writeStorage(next);
    },

    update(patch) {
      const next = normalize({ ...get().preferences, ...patch });
      set({ preferences: next, hydrated: true });
      void writeStorage(next);
    },
  })),
);

export const selectPreferences = (state: LocalPreferencesState) => state.preferences;
export const selectPreferencesHydrated = (state: LocalPreferencesState) => state.hydrated;
