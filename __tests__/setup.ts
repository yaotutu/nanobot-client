/// <reference types="node" />
import { vi } from 'vitest';

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

// Stub i18n module for tests
vi.mock('@/i18n', () => ({
  default: { t: (k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? k },
  currentLocale: () => 'en',
  ensureI18n: () => Promise.resolve(),
  setAppLanguage: () => Promise.resolve(),
  defaultLocale: 'en',
  fallbackLocale: 'en',
  supportedLocales: [],
  normalizeLocale: (x: string) => x,
  resolveDeviceLocale: () => 'en',
}));

// Stub react-native Platform for services that import it
vi.mock('react-native', async () => {
  return {
    Platform: { OS: 'ios', select: (obj: { ios?: unknown; android?: unknown; default?: unknown }) => obj.default ?? obj.ios },
  };
});
