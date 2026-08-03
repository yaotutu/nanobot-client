import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'nanobot-native.composer-recents';
const LIMIT = 5;

export interface ComposerRecentsState {
  commands: string[];
  hydrated: boolean;
  hydrate(): Promise<void>;
  record(command: string): void;
}

function normalize(commands: unknown): string[] {
  return Array.isArray(commands)
    ? commands.filter((item): item is string => typeof item === 'string').slice(0, LIMIT)
    : [];
}

async function readStorage(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

async function writeStorage(commands: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(commands.slice(0, LIMIT)));
  } catch {
    // Recents are best-effort; the in-memory state remains authoritative.
  }
}

let hydrationPromise: Promise<void> | null = null;

export const useComposerRecentsStore = create<ComposerRecentsState>()((set, get) => ({
  commands: [],
  hydrated: false,

  hydrate() {
    if (get().hydrated) return Promise.resolve();
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = readStorage()
      .then((commands) => set({ commands, hydrated: true }))
      .finally(() => {
        hydrationPromise = null;
      });
    return hydrationPromise;
  },

  record(command) {
    const next = [command, ...get().commands.filter((item) => item !== command)].slice(0, LIMIT);
    set({ commands: next, hydrated: true });
    void writeStorage(next);
  },
}));

export const selectComposerRecents = (state: ComposerRecentsState) => state.commands;
export const selectComposerRecentsHydrated = (state: ComposerRecentsState) => state.hydrated;
