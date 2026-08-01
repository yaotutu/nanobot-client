import * as SecureStore from 'expo-secure-store';

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
