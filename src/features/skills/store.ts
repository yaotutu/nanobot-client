import { create } from 'zustand';

import { fetchSkills } from '@/features/skills/api';
import type { SkillSummary, SkillsPayload } from '@/types/api/capabilities';

interface SkillsState {
  skills: SkillSummary[];
  payload: SkillsPayload | null;
  loaded: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

interface SkillsActions {
  refresh(): Promise<void>;
  applyPayload(payload: SkillsPayload): void;
  resetAll(): void;
}

export type SkillsStore = SkillsState & SkillsActions;

let refreshPromise: Promise<void> | null = null;
let refreshSequence = 0;
let activeRefreshId: number | null = null;
let generation = 0;

export const useSkillsStore = create<SkillsStore>()((set, get) => ({
  skills: [],
  payload: null,
  loaded: false,
  loading: false,
  refreshing: false,
  error: null,

  async refresh() {
    if (refreshPromise) return refreshPromise;
    const requestGeneration = generation;
    const refreshId = ++refreshSequence;
    activeRefreshId = refreshId;
    const hasCatalog = get().loaded;
    set({
      loading: !hasCatalog,
      refreshing: hasCatalog,
      error: null,
    });
    const request = (async () => {
      try {
        const payload = await fetchSkills();
        if (requestGeneration !== generation) return;
        set({
          skills: payload.skills ?? [],
          payload,
          loaded: true,
          error: null,
        });
      } catch (caught) {
        if (requestGeneration !== generation) return;
        set({ error: caught instanceof Error ? caught.message : String(caught) });
      } finally {
        if (requestGeneration === generation) {
          set({ loading: false, refreshing: false });
        }
        if (activeRefreshId === refreshId) {
          activeRefreshId = null;
          refreshPromise = null;
        }
      }
    })();
    refreshPromise = request;
    return request;
  },

  applyPayload(payload) {
    set({
      skills: payload.skills ?? [],
      payload,
      loaded: true,
      loading: false,
      refreshing: false,
      error: null,
    });
  },

  resetAll() {
    generation += 1;
    activeRefreshId = null;
    refreshPromise = null;
    set({
      skills: [],
      payload: null,
      loaded: false,
      loading: false,
      refreshing: false,
      error: null,
    });
  },
}));

export const selectSkills = (state: SkillsStore) => state.skills;
