import { useEffect } from 'react';

import { useAuthStore, selectAuthPhase, selectBootstrap } from '@/features/auth/store';
import { useCapabilitiesStore } from '@/features/capabilities/store';
import { useSidebarStore } from '@/features/sidebar/store';
import { useWorkspacesStore } from '@/features/workspaces/store';

export function useAuthBootstrapLifecycle(): void {
  const phase = useAuthStore(selectAuthPhase);
  const bootstrap = useAuthStore(selectBootstrap);
  const refreshAuth = useAuthStore((state) => state.refreshBootstrap);
  const refreshSessions = useSidebarStore((state) => state.refresh);
  const refreshSidebarState = useSidebarStore((state) => state.refreshSidebarState);
  const refreshCapabilities = useCapabilitiesStore((state) => state.refreshAll);
  const refreshWorkspaces = useWorkspacesStore((state) => state.refresh);

  useEffect(() => {
    void useAuthStore.getState().bootstrapFromStorage();
  }, []);

  useEffect(() => {
    if (phase !== 'ready' || !bootstrap) return;
    void refreshSessions();
    void refreshSidebarState();
    void refreshCapabilities();
    void refreshWorkspaces();
  }, [
    bootstrap,
    phase,
    refreshCapabilities,
    refreshSessions,
    refreshSidebarState,
    refreshWorkspaces,
  ]);

  useEffect(() => {
    if (!bootstrap || phase !== 'ready') return;
    const refreshAfterMs = Math.max(30_000, bootstrap.expires_in * 1_000 - 60_000);
    const timer = setTimeout(() => {
      void refreshAuth().catch(() => undefined);
    }, refreshAfterMs);
    return () => clearTimeout(timer);
  }, [bootstrap, phase, refreshAuth]);
}
