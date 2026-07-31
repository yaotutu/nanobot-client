import { getLocales } from 'expo-localization';

export const supportedLocales = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { code: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)', nativeLabel: 'Português (Brasil)' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
  { code: 'id', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia' },
] as const;

export type SupportedLocale = (typeof supportedLocales)[number]['code'];

export const defaultLocale: SupportedLocale = 'en';
export const fallbackLocale: SupportedLocale = 'en';

export function normalizeLocale(input: string | null | undefined): SupportedLocale {
  if (!input) return defaultLocale;
  const trimmed = input.trim();
  if (!trimmed) return defaultLocale;

  const exact = supportedLocales.find((locale) => locale.code === trimmed);
  if (exact) return exact.code;

  const lower = trimmed.toLowerCase();
  if (lower === 'zh' || lower.startsWith('zh-cn') || lower.startsWith('zh-sg')) {
    return 'zh-CN';
  }
  if (
    lower.startsWith('zh-tw')
    || lower.startsWith('zh-hk')
    || lower.startsWith('zh-mo')
    || lower.startsWith('zh-hant')
  ) {
    return 'zh-TW';
  }
  if (lower === 'pt' || lower.startsWith('pt-')) {
    return 'pt-BR';
  }

  const base = lower.split('-')[0];
  const baseMatch = supportedLocales.find((locale) => locale.code.toLowerCase() === base);
  return baseMatch?.code ?? defaultLocale;
}

export function resolveDeviceLocale(): SupportedLocale {
  try {
    return normalizeLocale(getLocales()[0]?.languageTag);
  } catch (error) {
    // expo-localization can throw on some release builds / older devices.
    // Fall back to the default locale rather than crashing the entire app
    // during synchronous module evaluation (which produces a black screen).
    // eslint-disable-next-line no-console
    console.warn('🟦 resolveDeviceLocale fallback', error instanceof Error ? error.message : String(error));
    return fallbackLocale;
  }
}

export function localeOption(locale: SupportedLocale) {
  return supportedLocales.find((entry) => entry.code === locale) ?? supportedLocales[0];
}
