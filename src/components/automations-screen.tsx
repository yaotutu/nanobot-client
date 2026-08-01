import type { TFunction } from 'i18next';
import {
  CalendarClock,
  CircleAlert,
  ChevronDown,
  RefreshCw,
  Search,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchAutomations, runAutomationAction, updateAutomation } from '@/features/automations/api';
import type {
  AutomationsPayload,
  AutomationUpdatePayload,
  SessionAutomationJob,
} from '@/types/api';
import type { Palette } from '@/ui/palette';

import { AutomationListItem } from './automations/AutomationListItem';
import { AutomationDetailPanel } from './automations/AutomationDetailPanel';
import { AutomationEditModal, SortSheet } from './automations/AutomationEditSheet';
import {
  FILTERS,
  automationNeedsAttention,
  automationStatusKey,
  errorMessage,
  matchesFilter,
  matchesSearch,
  parseSearchQuery,
  sortJobs,
} from './automations/automations-utils';
import type {
  AutomationAction,
  AutomationFilter,
  AutomationSort,
} from './automations/automations-utils';

interface AutomationsScreenProps {
  colors: Palette;
  onOpenLinkedChat: (sessionKey: string) => void;
}

export function AutomationsScreen({ colors, onOpenLinkedChat }: AutomationsScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [payload, setPayload] = useState<AutomationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AutomationFilter>('all');
  const [sort, setSort] = useState<AutomationSort>('next');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<SessionAutomationJob | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const delayedRefreshes = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const next = await fetchAutomations();
      setPayload(next);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, t('settings.automations.loadFailed', { defaultValue: 'Unable to load automations.' })));
    } finally {
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    const initial = setTimeout(() => void load('initial'), 0);
    const interval = setInterval(() => void load('silent'), 5_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      delayedRefreshes.current.forEach(clearTimeout);
      delayedRefreshes.current = [];
    };
  }, [load]);

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

  const applyPayload = (next: AutomationsPayload) => {
    setPayload(next);
    setError(null);
  };

  const act = async (action: AutomationAction, job: SessionAutomationJob) => {
    const key = `${action}:${job.id}`;
    setActionKey(key);
    try {
      const next = await runAutomationAction(action, job.id);
      applyPayload(next);
      if (action === 'delete') setSelectedId(null);
      if (action === 'run') {
        delayedRefreshes.current.push(
          setTimeout(() => void load('silent'), 1_200),
          setTimeout(() => void load('silent'), 4_000),
        );
      }
    } catch (caught) {
      setError(errorMessage(caught, t('settings.automations.actionFailed', { defaultValue: 'Automation action failed.' })));
    } finally {
      setActionKey(null);
    }
  };

  const requestDelete = (job: SessionAutomationJob) => {
    const name = job.name || job.id;
    Alert.alert(t('settings.automations.deleteTitle'), t('settings.automations.deleteDescription', { name }), [
      { text: t('settings.automations.cancel'), style: 'cancel' },
      { text: t('settings.automations.delete'), style: 'destructive', onPress: () => void act('delete', job) },
    ]);
  };

  const saveEdit = async (job: SessionAutomationJob, values: AutomationUpdatePayload) => {
    const key = `update:${job.id}`;
    setActionKey(key);
    try {
      const next = await updateAutomation(job.id, values);
      applyPayload(next);
      setEditingJob(null);
    } catch (caught) {
      setError(errorMessage(caught, t('settings.automations.saveFailed', { defaultValue: 'Unable to save automation.' })));
    } finally {
      setActionKey(null);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.pageContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            colors={[colors.muted]}
            onRefresh={() => void load('refresh')}
            refreshing={refreshing}
            tintColor={colors.muted}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.filterScrollerWrap}>
          <ScrollView
            contentContainerStyle={styles.filterRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {FILTERS.map((item) => {
              const selected = filter === item;
              const label = t(`settings.automations.filters.${item}`);
              return (
                <Pressable
                  accessibilityLabel={`${label} ${counts[item]}`}
                  accessibilityState={{ selected }}
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[
                    styles.filterButton,
                    { backgroundColor: selected ? colors.card : colors.pressed },
                  ]}
                >
                  <Text style={[styles.filterLabel, { color: selected ? colors.foreground : filterTone(item, counts[item], colors.muted) }]}>
                    {label}
                  </Text>
                  <View style={[styles.filterCount, { backgroundColor: colors.background }]}>
                    <Text style={[styles.filterCountText, { color: filterTone(item, counts[item], colors.muted) }]}>
                      {counts[item]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.controlsRow}>
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Search color={colors.subtle} size={16} strokeWidth={1.8} />
            <TextInput
              accessibilityLabel={t('settings.automations.search')}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder={t('settings.automations.search')}
              placeholderTextColor={colors.subtle}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.foreground }]}
              value={query}
            />
            {query ? (
              <Pressable accessibilityLabel={t('settings.automations.clearSearch', { defaultValue: 'Clear search' })} hitSlop={8} onPress={() => setQuery('')}>
                <X color={colors.subtle} size={15} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={t('settings.automations.sortLabel', { defaultValue: 'Sort: {{sort}}', sort: sortLabel(sort, t) })}
            onPress={() => setSortOpen(true)}
            style={({ pressed }) => [
              styles.sortButton,
              { backgroundColor: pressed ? colors.pressed : colors.card, borderColor: colors.border },
            ]}
          >
            <Text numberOfLines={1} style={[styles.sortButtonText, { color: colors.foreground }]}>{sortLabel(sort, t)}</Text>
            <ChevronDown color={colors.muted} size={14} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel={t('settings.automations.refresh', { defaultValue: 'Refresh automations' })}
            disabled={refreshing}
            onPress={() => void load('refresh')}
            style={({ pressed }) => [styles.refreshButton, pressed && { backgroundColor: colors.pressed }]}
          >
            {refreshing
              ? <ActivityIndicator color={colors.muted} size="small" />
              : <RefreshCw color={colors.muted} size={17} strokeWidth={1.8} />}
          </Pressable>
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground, borderColor: colors.errorText }]}>
            <CircleAlert color={colors.errorText} size={16} strokeWidth={1.8} />
            <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
            <Pressable accessibilityLabel={t('common.dismiss')} hitSlop={8} onPress={() => setError(null)}>
              <X color={colors.errorText} size={15} strokeWidth={2} />
            </Pressable>
          </View>
        ) : null}

        {loading && !payload ? (
          <View style={[styles.loadingCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator color={colors.muted} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>{t('settings.automations.loading')}</Text>
          </View>
        ) : filtered.length > 0 && selectedJob ? (
          <View style={[styles.workspaceCard, { backgroundColor: colors.card }]}>
            <View style={[styles.queueSection, { borderBottomColor: colors.border }]}>
              <View style={styles.queueHeader}>
                <Text style={[styles.queueTitle, { color: colors.foreground }]}>{t('settings.automations.queue')}</Text>
                <View style={[styles.queueCount, { backgroundColor: '#FCE8D6' }]}>
                  <Text style={styles.queueCountText}>{filtered.length}</Text>
                </View>
              </View>
              <View style={styles.jobList}>
                {filtered.map((job) => (
                  <AutomationListItem
                    colors={colors}
                    job={job}
                    key={job.id}
                    onSelect={() => setSelectedId(job.id)}
                    selected={selectedJob.id === job.id}
                  />
                ))}
              </View>
            </View>
            <AutomationDetailPanel
              actionKey={actionKey}
              key={selectedJob.id}
              colors={colors}
              job={selectedJob}
              onAction={act}
              onEdit={() => setEditingJob(selectedJob)}
              onOpenLinkedChat={onOpenLinkedChat}
              onRequestDelete={() => requestDelete(selectedJob)}
            />
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <CalendarClock color={colors.subtle} size={22} strokeWidth={1.6} />
            <Text style={[styles.emptyTitle, { color: colors.muted }]}>
              {jobs.length ? t('settings.automations.noMatches') : t('settings.automations.empty')}
            </Text>
            {!jobs.length ? (
              <Text style={[styles.emptyHint, { color: colors.subtle }]}>{t('settings.automations.emptyHint')}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      <SortSheet colors={colors} onClose={() => setSortOpen(false)} onSelect={setSort} selected={sort} visible={sortOpen} />
      <AutomationEditModal
        colors={colors}
        job={editingJob}
        onClose={() => setEditingJob(null)}
        onSave={saveEdit}
        saving={Boolean(editingJob && actionKey === `update:${editingJob.id}`)}
      />
    </View>
  );
}

function sortLabel(sort: AutomationSort, t: TFunction): string {
  return t(`settings.automations.sort.${sort}`);
}

function filterTone(filter: AutomationFilter, count: number, fallback: string): string {
  if (!count) return fallback;
  if (filter === 'active') return '#4C8B66';
  if (filter === 'paused') return '#A57B2F';
  if (filter === 'failed') return '#B6534D';
  if (filter === 'system') return '#4B7E9F';
  return fallback;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 28, gap: 13 },
  filterScrollerWrap: { marginHorizontal: -2 },
  filterRow: { minWidth: 570, gap: 5, paddingHorizontal: 2 },
  filterButton: { height: 40, minWidth: 105, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  filterCount: { minWidth: 23, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  filterCountText: { fontSize: 11, fontWeight: '700' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  searchBox: { flex: 1, minWidth: 0, height: 42, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, height: 42, paddingVertical: 0, fontSize: 12.5 },
  sortButton: { maxWidth: 116, height: 42, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  sortButtonText: { flexShrink: 1, fontSize: 11.5, fontWeight: '600' },
  refreshButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  errorBanner: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  loadingCard: { minHeight: 180, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  loadingText: { fontSize: 13 },
  workspaceCard: { borderRadius: 22, overflow: 'hidden' },
  queueSection: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 7 },
  queueHeader: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  queueTitle: { fontSize: 13, fontWeight: '700' },
  queueCount: { minWidth: 30, height: 22, borderRadius: 11, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  queueCountText: { color: '#9B5724', fontSize: 11, fontWeight: '700' },
  jobList: { paddingHorizontal: 8, paddingBottom: 2, gap: 3 },
  emptyCard: { minHeight: 180, borderRadius: 22, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', gap: 9 },
  emptyTitle: { fontSize: 13, textAlign: 'center' },
  emptyHint: { maxWidth: 320, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
