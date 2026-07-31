import * as SecureStore from 'expo-secure-store';

// DEVELOPMENT ONLY bootstrap secret. The source file src/lib/dev-secret.ts is
// git-ignored and only exists locally; it is never committed to the repository.
// It allows the app to auto-authenticate during device acceptance without
// manual password entry. In clean checkouts the import resolves to an empty
// string and the normal authentication screen is shown.
import { DEV_BOOTSTRAP_SECRET } from './dev-secret';

const BOOTSTRAP_SECRET_KEY = 'nanobot.bootstrap-secret';

export async function loadBootstrapSecret(): Promise<string> {
  return (await SecureStore.getItemAsync(BOOTSTRAP_SECRET_KEY)) ?? '';
}

export async function saveBootstrapSecret(secret: string): Promise<void> {
  await SecureStore.setItemAsync(BOOTSTRAP_SECRET_KEY, secret, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearBootstrapSecret(): Promise<void> {
  await SecureStore.deleteItemAsync(BOOTSTRAP_SECRET_KEY);
}

/**
 * Returns the local development bootstrap secret, if any. Empty string when
 * the dev override is absent (e.g. production builds / clean checkouts).
 */
export function loadDevBootstrapSecret(): string {
  return typeof DEV_BOOTSTRAP_SECRET === 'string' ? DEV_BOOTSTRAP_SECRET : '';
}
