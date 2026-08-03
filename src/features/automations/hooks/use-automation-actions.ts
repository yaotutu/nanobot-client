import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runAutomationAction, updateAutomation } from '@/features/automations/api';
import {
  errorMessage,
  type AutomationAction,
} from '@/features/automations/components/automations-utils';
import type {
  AutomationsPayload,
  AutomationUpdatePayload,
  SessionAutomationJob,
} from '@/types/api/automations';

interface UseAutomationActionsOptions {
  applyPayload: (payload: AutomationsPayload) => void;
  onDeleted: () => void;
  onSaved: () => void;
  refresh: () => void;
  setError: (error: string | null) => void;
}

export function useAutomationActions({
  applyPayload,
  onDeleted,
  onSaved,
  refresh,
  setError,
}: UseAutomationActionsOptions) {
  const { t } = useTranslation();
  const [actionKey, setActionKey] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const actionRequestIdRef = useRef(0);
  const delayedRefreshesRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      actionRequestIdRef.current += 1;
      delayedRefreshesRef.current.forEach(clearTimeout);
      delayedRefreshesRef.current = [];
    };
  }, []);

  const scheduleRefresh = useCallback((delayMs: number) => {
    const timer = setTimeout(() => {
      delayedRefreshesRef.current = delayedRefreshesRef.current.filter((item) => item !== timer);
      if (mountedRef.current) refresh();
    }, delayMs);
    delayedRefreshesRef.current.push(timer);
  }, [refresh]);

  const act = useCallback(async (action: AutomationAction, job: SessionAutomationJob) => {
    if (actionKey !== null) return;
    const key = `${action}:${job.id}`;
    const requestId = ++actionRequestIdRef.current;
    setActionKey(key);
    setError(null);
    try {
      const next = await runAutomationAction(action, job.id);
      if (!mountedRef.current || requestId !== actionRequestIdRef.current) return;
      applyPayload(next);
      if (action === 'delete') onDeleted();
      if (action === 'run') {
        scheduleRefresh(1_200);
        scheduleRefresh(4_000);
      }
    } catch (caught) {
      if (!mountedRef.current || requestId !== actionRequestIdRef.current) return;
      setError(errorMessage(caught, t('settings.automations.actionFailed', {
        defaultValue: 'Automation action failed.',
      })));
    } finally {
      if (mountedRef.current && requestId === actionRequestIdRef.current) setActionKey(null);
    }
  }, [actionKey, applyPayload, onDeleted, scheduleRefresh, setError, t]);

  const save = useCallback(async (job: SessionAutomationJob, values: AutomationUpdatePayload) => {
    if (actionKey !== null) return;
    const key = `update:${job.id}`;
    const requestId = ++actionRequestIdRef.current;
    setActionKey(key);
    setError(null);
    try {
      const next = await updateAutomation(job.id, values);
      if (!mountedRef.current || requestId !== actionRequestIdRef.current) return;
      applyPayload(next);
      onSaved();
    } catch (caught) {
      if (!mountedRef.current || requestId !== actionRequestIdRef.current) return;
      setError(errorMessage(caught, t('settings.automations.saveFailed', {
        defaultValue: 'Unable to save automation.',
      })));
    } finally {
      if (mountedRef.current && requestId === actionRequestIdRef.current) setActionKey(null);
    }
  }, [actionKey, applyPayload, onSaved, setError, t]);

  return { actionKey, act, save };
}
