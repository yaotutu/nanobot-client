import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import * as SecureStore from 'expo-secure-store';

import { normalizeLocale, resolveDeviceLocale } from '@/i18n/config';
import type {
  AppLanguage,
  AppTheme,
  FileEditDisplayMode,
  LocalActivityMode,
  LocalDensity,
} from '@/types/domain';

export type {
  AppLanguage,
  AppTheme,
  FileEditDisplayMode,
  LocalActivityMode,
  LocalDensity,
} from '@/types/domain';

export interface LocalPreferences {
  theme: AppTheme;
  language: AppLanguage;
  density: LocalDensity;
  activityMode: LocalActivityMode;
  codeWrap: boolean;
  brandLogos: boolean;
  fileEditDisplayMode: FileEditDisplayMode;
}

const STORAGE_KEY = 'nanobot-native.local-preferences';

export const DEFAULT_LOCAL_PREFS: LocalPreferences = {
  theme: 'light',
  language: resolveDeviceLocale(),
  density: 'comfortable',
  activityMode: 'auto',
  codeWrap: true,
  brandLogos: false,
  fileEditDisplayMode: 'summary',
};

function normalize(raw: unknown): LocalPreferences {
  const v = raw && typeof raw === 'object' ? (raw as Partial<LocalPreferences>) : {};
  return {
    theme: v.theme === 'dark' ? 'dark' : 'light',
    language: normalizeLocale(v.language),
    density: v.density === 'compact' ? 'compact' : 'comfortable',
    activityMode: v.activityMode === 'expanded' ? 'expanded' : 'auto',
    codeWrap: v.codeWrap !== false,
    brandLogos: v.brandLogos === true,
    fileEditDisplayMode:
      v.fileEditDisplayMode === 'diff' || v.fileEditDisplayMode === 'collapsed_diff'
        ? v.fileEditDisplayMode
        : 'summary',
  };
}

interface LocalPreferencesState {
  preferences: LocalPreferences;
  hydrated: boolean;
  hydrate(): Promise<void>;
  update(patch: Partial<LocalPreferences>): void;
}

async function readFromSecureStore(): Promise<LocalPreferences> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_PREFS;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_LOCAL_PREFS;
  }
}

async function writeToSecureStore(prefs: LocalPreferences): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort
  }
}

export const useLocalPreferencesStore = create<LocalPreferencesState>()(
  subscribeWithSelector((set, get) => ({
    preferences: DEFAULT_LOCAL_PREFS,
    hydrated: false,

    async hydrate() {
      if (get().hydrated) return;
      const preferences = await readFromSecureStore();
      set({ preferences, hydrated: true });
    },

    update(patch) {
      const next = { ...get().preferences, ...patch };
      set({ preferences: next });
      void writeToSecureStore(next);
    },
  })),
);

export const selectTheme = (s: LocalPreferencesState) => s.preferences.theme;
export const selectLanguage = (s: LocalPreferencesState) => s.preferences.language;

/** 一次性从 SecureStore 读取 local prefs；不写入 store。 */
export async function readLocalPreferences(): Promise<LocalPreferences> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_PREFS;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_LOCAL_PREFS;
  }
}

export async function writeLocalPreferences(preferences: LocalPreferences): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // best-effort
  }
}
