import { useCallback, useEffect, useRef } from 'react';

import type { ChatSummary } from '@/types/nanobot';

const TITLE_REFRESH_RETRY_DELAYS_MS = [1_000, 3_000, 7_000] as const;

function hasGeneratedTitle(session: ChatSummary | null): boolean {
  return Boolean(session?.title?.trim());
}

/**
 * Server-generated titles can arrive after the main turn has ended. Refresh
 * immediately, then retry lightly while the selected session remains untitled.
 */
export function useDeferredTitleRefresh(
  activeSession: ChatSummary | null,
  refresh: () => Promise<void>,
  retryDelaysMs: readonly number[] = TITLE_REFRESH_RETRY_DELAYS_MS,
): () => void {
  const activeSessionRef = useRef(activeSession);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    clearTimers();
  }, [activeSession?.key, clearTimers]);

  useEffect(() => {
    if (hasGeneratedTitle(activeSession)) clearTimers();
  }, [activeSession, clearTimers]);

  return useCallback(() => {
    void refresh();

    const sessionAtTurnEnd = activeSessionRef.current;
    if (!sessionAtTurnEnd || hasGeneratedTitle(sessionAtTurnEnd)) return;

    clearTimers();
    for (const delayMs of retryDelaysMs) {
      const timer = setTimeout(() => {
        const latest = activeSessionRef.current;
        if (
          !latest
          || latest.key !== sessionAtTurnEnd.key
          || hasGeneratedTitle(latest)
        ) return;
        void refresh();
      }, delayMs);
      timersRef.current.push(timer);
    }
  }, [clearTimers, refresh, retryDelaysMs]);
}
