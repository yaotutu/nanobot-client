import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useAutomationActions } from '@/features/automations/hooks/use-automation-actions';
import { useAutomationsCatalog } from '@/features/automations/hooks/use-automations-catalog';
import {
  automationNeedsAttention,
  automationStatusKey,
  matchesFilter,
  matchesSearch,
  parseSearchQuery,
  sortJobs,
  type AutomationFilter,
  type AutomationSort,
} from '@/features/automations/model';
import type { SessionAutomationJob } from '@/types/api/automations';

export function useAutomationsScreenController() {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const {
    applyPayload,
    error,
    load,
    loading,
    payload,
    refreshing,
    setError,
  } = useAutomationsCatalog();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AutomationFilter>('all');
  const [sort, setSort] = useState<AutomationSort>('next');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<SessionAutomationJob | null>(null);
  const jobs = useMemo(() => payload?.jobs ?? [], [payload]);
  const counts = useMemo(() => ({
    all: jobs.length,
    active: jobs.filter((job) => ['active', 'running'].includes(automationStatusKey(job))).length,
    paused: jobs.filter((job) => automationStatusKey(job) === 'paused').length,
    failed: jobs.filter(automationNeedsAttention).length,
    system: jobs.filter((job) => Boolean(job.protected)).length,
  }), [jobs]);
  const filtered = useMemo(() => {
    const tokens = parseSearchQuery(query);
    return sortJobs(jobs, sort, locale)
      .filter((job) => matchesFilter(job, filter))
      .filter((job) => tokens.length === 0 || matchesSearch(job, tokens, t, locale));
  }, [filter, jobs, locale, query, sort, t]);
  const selectedJob = filtered.find((job) => job.id === selectedId) ?? filtered[0] ?? null;

  const clearSelection = useCallback(() => setSelectedId(null), []);
  const closeEditor = useCallback(() => setEditingJob(null), []);
  const silentRefresh = useCallback(() => { void load('silent'); }, [load]);
  const { actionKey, act, save: saveEdit } = useAutomationActions({
    applyPayload,
    onDeleted: clearSelection,
    onSaved: closeEditor,
    refresh: silentRefresh,
    setError,
  });

  const requestDelete = useCallback((job: SessionAutomationJob) => {
    const name = job.name || job.id;
    Alert.alert(
      t('settings.automations.deleteTitle'),
      t('settings.automations.deleteDescription', { name }),
      [
        { text: t('settings.automations.cancel'), style: 'cancel' },
        {
          text: t('settings.automations.delete'),
          style: 'destructive',
          onPress: () => void act('delete', job),
        },
      ],
    );
  }, [act, t]);

  return {
    actionKey,
    act,
    counts,
    editingJob,
    error,
    filter,
    filtered,
    jobs,
    load,
    loading,
    payload,
    query,
    refreshing,
    requestDelete,
    saveEdit,
    selectedJob,
    setEditingJob,
    setError,
    setFilter,
    setQuery,
    setSelectedId,
    setSort,
    setSortOpen,
    sort,
    sortOpen,
  };
}
