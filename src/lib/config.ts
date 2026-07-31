const PRODUCT_SERVER_URL = 'http://192.168.55.147:8765';
const DEVELOPMENT_SERVER_URL = 'http://localhost:8765';

export function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * Development clients use the existing `adb reverse tcp:8765 tcp:8765`
 * tunnel, while production keeps the configured nanobot gateway address.
 * EXPO_PUBLIC_NANOBOT_SERVER_URL can override either value without changing
 * source code.
 */
export const DEFAULT_SERVER_URL = normalizeServerUrl(
  process.env.EXPO_PUBLIC_NANOBOT_SERVER_URL
    || (__DEV__ ? DEVELOPMENT_SERVER_URL : PRODUCT_SERVER_URL),
);
