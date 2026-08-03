import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { SessionAutomationJob } from '@/types/api/automations';

const AUTOMATIONS_REFRESH_MS = 3_000;

interface UseSessionAutomationsOptions {
  loadJobs: (sessionKey: string) => Promise<SessionAutomationJob[]>;
  sessionKey: string | null;
  visible: boolean;
}

export function useSessionAutomations({
  loadJobs,
  sessionKey,
  visible,
}: UseSessionAutomationsOptions) {
  const [jobs, setJobs] = useState<SessionAutomationJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    if (!visible || !sessionKey) return;
    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    let cancelled = false;
    let loadedOnce = false;

    const refresh = async (showLoading = false) => {
      if (showLoading) {
        setLoading(true);
        setLoadFailed(false);
        setJobs([]);
      }
      try {
        const nextJobs = await loadJobs(sessionKey);
        if (cancelled || requestGenerationRef.current !== generation) return;
        setJobs(nextJobs);
        setLoadFailed(false);
        loadedOnce = true;
      } catch {
        if (!cancelled && requestGenerationRef.current === generation && !loadedOnce) {
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled && requestGenerationRef.current === generation && showLoading) {
          setLoading(false);
        }
      }
    };

    void refresh(true);
    const refreshId = setInterval(() => void refresh(false), AUTOMATIONS_REFRESH_MS);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh(false);
    });
    return () => {
      cancelled = true;
      clearInterval(refreshId);
      appStateSubscription.remove();
    };
  }, [loadJobs, sessionKey, visible]);

  return { jobs, loadFailed, loading };
}
