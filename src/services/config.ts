import { Platform } from 'react-native';

const PRODUCT_SERVER_URL = 'http://192.168.55.147:8765';
const REVERSE_TUNNEL_SERVER_URL = 'http://localhost:8765';
const LOOPBACK_ANDROID_SERVER_URL = 'http://10.0.2.2:8765';

export function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * Default gateway resolution order:
 *
 * 1. `EXPO_PUBLIC_NANOBOT_SERVER_URL` build-time override (preferred).
 * 2. `localhost:8765` when the Android device is connected over USB so an
 *    `adb reverse tcp:8765 tcp:8765` tunnel can route to the host. iOS
 *    Simulator uses the same value via metro.
 * 3. The committed LAN gateway documented in the active goal.
 *
 * This keeps the production default address stable while still allowing
 * developers to validate on a USB-tethered Android device without
 * rebuilding.
 */
function resolveDefaultServerUrl(): string {
  const override = process.env.EXPO_PUBLIC_NANOBOT_SERVER_URL;
  if (override && override.length > 0) {
    return normalizeServerUrl(override);
  }
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return REVERSE_TUNNEL_SERVER_URL;
    }
    return LOOPBACK_ANDROID_SERVER_URL;
  }
  return PRODUCT_SERVER_URL;
}

export const DEFAULT_SERVER_URL = resolveDefaultServerUrl();
