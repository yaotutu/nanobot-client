import { create } from 'zustand';

import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'nanobot-native.composer-recents';
const LIMIT = 5;

interface ComposerRecentsState {
  commands: string[];
  hydrated: boolean;
  hydrate(): Promise<void>;
  record(command: string): void;
}

async function readStorage(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}

async function writeStorage(commands: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(commands.slice(0, LIMIT)));
  } catch {
    // best-effort
  }
}

export const useComposerRecentsStore = create<ComposerRecentsState>()((set, get) => ({
  commands: [],
  hydrated: false,

  async hydrate() {
    if (get().hydrated) return;
    const commands = await readStorage();
    set({ commands, hydrated: true });
  },

  record(command) {
    const next = [command, ...get().commands.filter((c) => c !== command)].slice(0, LIMIT);
    set({ commands: next });
    void writeStorage(next);
  },
}));

export const selectComposerRecents = (s: ComposerRecentsState) => s.commands;

export async function readComposerRecents(): Promise<string[]> {
  return readStorage();
}

export async function writeComposerRecents(commands: string[]): Promise<void> {
  return writeStorage(commands);
}
