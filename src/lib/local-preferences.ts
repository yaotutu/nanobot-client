import * as SecureStore from 'expo-secure-store';

import { normalizeLocale, resolveDeviceLocale, type SupportedLocale } from '@/i18n/config';

export type AppTheme = 'light' | 'dark';
export type AppLanguage = SupportedLocale;
export type LocalDensity = 'comfortable' | 'compact';
export type LocalActivityMode = 'auto' | 'expanded';
export type FileEditDisplayMode = 'summary' | 'diff' | 'collapsed_diff';

export interface LocalPreferences {
  theme: AppTheme;
  language: AppLanguage;
  density: LocalDensity;
  activityMode: LocalActivityMode;
  codeWrap: boolean;
  brandLogos: boolean;
  fileEditDisplayMode: FileEditDisplayMode;
}

const LOCAL_PREFS_STORAGE_KEY = 'nanobot-native.local-preferences';
const COMPOSER_RECENTS_STORAGE_KEY = 'nanobot-native.composer-recents';
const COMPOSER_RECENTS_LIMIT = 5;

export const DEFAULT_LOCAL_PREFS: LocalPreferences = {
  theme: 'light',
  language: resolveDeviceLocale(),
  density: 'comfortable',
  activityMode: 'auto',
  codeWrap: true,
  brandLogos: false,
  fileEditDisplayMode: 'summary',
};

export function normalizeLocalPreferences(value: unknown): LocalPreferences {
  const raw = value && typeof value === 'object' ? value as Partial<LocalPreferences> : {};
  return {
    theme: raw.theme === 'dark' ? 'dark' : 'light',
    language: normalizeLocale(raw.language),
    density: raw.density === 'compact' ? 'compact' : 'comfortable',
    activityMode: raw.activityMode === 'expanded' ? 'expanded' : 'auto',
    codeWrap: raw.codeWrap !== false,
    brandLogos: raw.brandLogos === true,
    fileEditDisplayMode: raw.fileEditDisplayMode === 'diff' || raw.fileEditDisplayMode === 'collapsed_diff'
      ? raw.fileEditDisplayMode
      : 'summary',
  };
}

export async function readLocalPreferences(): Promise<LocalPreferences> {
  try {
    const raw = await SecureStore.getItemAsync(LOCAL_PREFS_STORAGE_KEY);
    return raw ? normalizeLocalPreferences(JSON.parse(raw)) : DEFAULT_LOCAL_PREFS;
  } catch {
    return DEFAULT_LOCAL_PREFS;
  }
}

export async function writeLocalPreferences(preferences: LocalPreferences): Promise<void> {
  try {
    await SecureStore.setItemAsync(LOCAL_PREFS_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Local appearance preferences must never block the app.
  }
}

export async function readComposerRecents(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(COMPOSER_RECENTS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, COMPOSER_RECENTS_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export async function writeComposerRecents(commands: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      COMPOSER_RECENTS_STORAGE_KEY,
      JSON.stringify(commands.slice(0, COMPOSER_RECENTS_LIMIT)),
    );
  } catch {
    // Composer history is optional and must never block command insertion.
  }
}
