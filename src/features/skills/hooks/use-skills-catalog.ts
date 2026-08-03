import { useCallback, useEffect } from 'react';

import { useSkillsStore } from '@/features/skills/store';

export function useSkillsCatalog() {
  const skills = useSkillsStore((state) => state.skills);
  const loaded = useSkillsStore((state) => state.loaded);
  const loading = useSkillsStore((state) => state.loading);
  const refreshing = useSkillsStore((state) => state.refreshing);
  const error = useSkillsStore((state) => state.error);
  const refresh = useSkillsStore((state) => state.refresh);

  useEffect(() => {
    if (loaded || loading) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [loaded, loading, refresh]);

  const load = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && useSkillsStore.getState().loaded) return;
    await refresh();
  }, [refresh]);

  return { error, load, loading, refreshing, skills };
}
