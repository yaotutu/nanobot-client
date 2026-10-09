import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { normalizeLocale, resolveDeviceLocale } from '@/i18n/config';
import { DEFAULT_SERVER_URL, normalizeServerUrl, setServerUrl } from '@/services/api/config';
import type { AppLanguage, AppTheme } from '@/types/domain';

export interface LocalPreferences {
  theme: AppTheme;
  language: AppLanguage;
  /** 用户选择的服务器地址；未配置时为空，完整地址只在认证前由用户确认。 */
  serverUrl: string;
  /** 是否已经由用户确认过地址；首次安装时先进入服务器配置，不默认要求输入密码。 */
  serverConfigured: boolean;
  /** 默认会话 key；只作为启动/异常恢复的本地选择，不跟随用户手动切换变化。 */
  defaultSessionKey: string | null;
  /** 默认会话归属的服务器地址，用于切换网关后自动失效旧会话。 */
  defaultSessionServerUrl: string;
}

const STORAGE_KEY = 'nanobot-native.local-preferences';

export const DEFAULT_LOCAL_PREFS: LocalPreferences = {
  theme: 'light',
  language: resolveDeviceLocale(),
  serverUrl: DEFAULT_SERVER_URL,
  serverConfigured: false,
  defaultSessionKey: null,
  defaultSessionServerUrl: '',
};

function normalize(raw: unknown): LocalPreferences {
  const value = raw && typeof raw === 'object' ? (raw as Partial<LocalPreferences>) : {};
  const serverUrl = normalizeServerUrl(value.serverUrl ?? '');
  const rawDefaultSessionKey = typeof value.defaultSessionKey === 'string' ? value.defaultSessionKey.trim() : '';
  const defaultSessionServerUrl = normalizeServerUrl(value.defaultSessionServerUrl ?? '') ?? '';
  // 默认会话必须同时具备合法 key 并绑定当前服务器，否则视为不存在，避免跨网关误选会话。
  const defaultSessionKey = rawDefaultSessionKey && defaultSessionServerUrl === serverUrl ? rawDefaultSessionKey : null;
  // 显式构造当前偏好，统一规范化主题、语言和服务器地址，避免旧字段或非法输入进入持久化结构。
  return {
    theme: value.theme === 'dark' ? 'dark' : 'light',
    language: normalizeLocale(value.language),
    serverUrl: serverUrl ?? '',
    // 只有存在合法地址时才允许已配置状态，避免损坏的持久化数据跳过服务器配置页。
    serverConfigured: value.serverConfigured === true && serverUrl !== null,
    defaultSessionKey,
    defaultSessionServerUrl: defaultSessionKey ? serverUrl ?? '' : '',
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

function applyServerUrl(preferences: LocalPreferences): LocalPreferences {
  setServerUrl(preferences.serverUrl);
  return preferences;
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
        .then((preferences) => set({ preferences: applyServerUrl(preferences), hydrated: true }))
        .finally(() => {
          hydrationPromise = null;
        });
      return hydrationPromise;
    },

    replace(preferences) {
      const next = applyServerUrl(normalize(preferences));
      set({ preferences: next, hydrated: true });
      void writeStorage(next);
    },

    update(patch) {
      const next = applyServerUrl(normalize({ ...get().preferences, ...patch }));
      set({ preferences: next, hydrated: true });
      void writeStorage(next);
    },
  })),
);

export const selectPreferences = (state: LocalPreferencesState) => state.preferences;
export const selectPreferencesHydrated = (state: LocalPreferencesState) => state.hydrated;
