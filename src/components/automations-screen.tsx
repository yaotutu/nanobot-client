import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { TFunction } from 'i18next';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ExternalLink,
  PauseCircle,
  Pencil,
  PlayCircle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { fetchAutomations, runAutomationAction, updateAutomation } from '@/features/automations/api';
import { relativeTimeFromMs, safeDateTimeFormat, safeNumberFormat } from '@/services/format';
import type {
  AutomationsPayload,
  AutomationUpdatePayload,
  SessionAutomationJob,
} from '@/types/api';
import type { Palette } from '@/ui/palette';


interface AutomationsScreenProps {
  colors: Palette;
  onOpenLinkedChat: (sessionKey: string) => void;
}

type AutomationFilter = 'all' | 'active' | 'paused' | 'failed' | 'system';
type AutomationSort = 'next' | 'last' | 'updated' | 'name';
type AutomationAction = 'enable' | 'disable' | 'delete' | 'run';
type AutomationStatus = 'active' | 'running' | 'paused' | 'failed' | 'system' | 'completed' | 'idle';
type EveryUnit = 'second' | 'minute' | 'hour' | 'day';
type ScheduleKind = 'at' | 'every' | 'cron';

interface SearchToken {
  field: 'id' | 'name' | 'message' | 'chat' | 'cron' | 'schedule' | 'status' | null;
  value: string;
}

interface EditDraft {
  name: string;
  message: string;
  scheduleKind: ScheduleKind;
  everyValue: string;
  everyUnit: EveryUnit;
  cronExpr: string;
  tz: string;
  atDate: Date;
}

const SEARCH_FIELDS = new Set(['id', 'name', 'message', 'chat', 'cron', 'schedule', 'status']);
const AUTOMATION_CHANNELS = new Set([
  'api', 'cli', 'dingtalk', 'discord', 'email', 'feishu', 'matrix', 'msteams', 'qq', 'slack',
  'telegram', 'wechat', 'wecom', 'weixin', 'whatsapp',
]);
const FILTERS: AutomationFilter[] = ['all', 'active', 'paused', 'failed', 'system'];
const SORTS: AutomationSort[] = ['next', 'last', 'updated', 'name'];
const EVERY_UNITS: Array<{ key: EveryUnit; ms: number }> = [
  { key: 'second', ms: 1_000 },
  { key: 'minute', ms: 60_000 },
  { key: 'hour', ms: 3_600_000 },
  { key: 'day', ms: 86_400_000 },
];

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

function AutomationListItem({
  job,
  selected,
  colors,
  onSelect,
}: {
  job: SessionAutomationJob;
  selected: boolean;
  colors: Palette;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const status = automationStatus(job, t);
  return (
    <Pressable
      accessibilityLabel={`${job.name || job.id}，${status.label}`}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.jobRow,
        { backgroundColor: selected || pressed ? colors.background : 'transparent' },
      ]}
    >
      <View style={styles.jobMain}>
        <View style={styles.jobNameRow}>
          <View style={[styles.statusDot, { backgroundColor: statusDotColor(job) }]} />
          <Text numberOfLines={1} style={[styles.jobName, { color: colors.foreground }]}>{job.name || job.id}</Text>
        </View>
        <Text numberOfLines={2} style={[styles.jobSummary, { color: colors.muted }]}>{automationSummary(job, t)}</Text>
        <View style={styles.jobMetaRow}>
          <Text numberOfLines={1} style={[styles.jobMeta, { color: colors.subtle }]}>{formatNext(job, t, locale)}</Text>
          <Text style={[styles.jobMetaDot, { color: colors.subtle }]}>·</Text>
          <Text numberOfLines={1} style={[styles.jobMeta, { color: colors.subtle }]}>{originLabel(job, t)}</Text>
        </View>
      </View>
      <View style={styles.jobBadges}>
        <StatusBadge colors={colors} tone={status.tone}>{status.label}</StatusBadge>
        {job.delete_after_run ? <Text style={[styles.oneTime, { color: colors.subtle }]}>{t('settings.automations.oneShot')}</Text> : null}
      </View>
    </Pressable>
  );
}

function AutomationDetailPanel({
  job,
  colors,
  actionKey,
  onAction,
  onEdit,
  onRequestDelete,
  onOpenLinkedChat,
}: {
  job: SessionAutomationJob;
  colors: Palette;
  actionKey: string | null;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => Promise<void>;
  onEdit: () => void;
  onRequestDelete: () => void;
  onOpenLinkedChat: (sessionKey: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [expanded, setExpanded] = useState(false);
  const status = automationStatus(job, t);
  const detailText = automationSummary(job, t);
  const schedule = formatSchedule(job, t, locale);
  const created = formatDateTime(job.created_at_ms, locale);
  const updated = formatDateTime(job.updated_at_ms, locale);
  const sessionKey = job.origin?.channel === 'websocket' ? job.origin.session_key : undefined;


  return (
    <View style={styles.detailSection}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderCopy}>
          <Text numberOfLines={2} style={[styles.detailTitle, { color: colors.foreground }]}>{job.name || job.id}</Text>
          <View style={styles.detailBadges}>
            <StatusBadge colors={colors} tone={status.tone}>{status.label}</StatusBadge>
            <StatusBadge colors={colors}>{schedule}</StatusBadge>
            <StatusBadge colors={colors}>{originLabel(job, t)}</StatusBadge>
            {job.delete_after_run ? <StatusBadge colors={colors}>{t('settings.automations.oneShot')}</StatusBadge> : null}
          </View>
        </View>
        <AutomationActions
          actionKey={actionKey}
          colors={colors}
          job={job}
          onAction={onAction}
          onEdit={onEdit}
          onRequestDelete={onRequestDelete}
        />
      </View>

      <View style={[styles.messageCard, { backgroundColor: colors.background }]}>
        <Text style={[styles.detailLabel, { color: colors.subtle }]}>
          {isLocalTrigger(job)
            ? t('settings.automations.fields.command', { defaultValue: 'Command' })
            : t('settings.automations.fields.message')}
        </Text>
        <Text
          numberOfLines={!expanded && messageNeedsExpansion(detailText) ? 6 : undefined}
          selectable
          style={[styles.messageText, { color: colors.foreground }]}
        >
          {detailText}
        </Text>
        {messageNeedsExpansion(detailText) ? (
          <Pressable onPress={() => setExpanded((value) => !value)} style={styles.expandButton}>
            <Text style={[styles.expandText, { color: colors.muted }]}>
              {expanded ? t('settings.automations.message.showLess') : t('settings.automations.message.showMore')}
            </Text>
            {expanded
              ? <ChevronUp color={colors.muted} size={14} />
              : <ChevronDown color={colors.muted} size={14} />}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.detailGrid}>
        <DetailCard
          colors={colors}
          label={t('settings.automations.labels.next')}
          title={formatNextTitle(job, t, locale)}
          value={formatNext(job, t, locale)}
        />
        <DetailCard
          colors={colors}
          label={t('settings.automations.labels.origin')}
          title={originLabel(job, t)}
          value={originLabel(job, t)}
          onPress={sessionKey ? () => onOpenLinkedChat(sessionKey) : undefined}
        />
      </View>

      {job.state.last_error ? (
        <View style={[styles.lastError, { backgroundColor: colors.errorBackground, borderColor: colors.errorText }]}>
          <Text selectable style={[styles.lastErrorText, { color: colors.errorText }]}>{job.state.last_error}</Text>
        </View>
      ) : null}

      <View style={[styles.metadataArea, { borderTopColor: colors.border }]}>
        <DetailCard colors={colors} label={t('settings.automations.labels.schedule')} title={schedule} value={schedule} />
        <View style={[styles.metadataCard, { backgroundColor: colors.background }]}>
          {created ? <MetadataLine colors={colors} label={t('settings.automations.labels.created')} value={created} /> : null}
          {updated ? <MetadataLine colors={colors} label={t('settings.automations.labels.updated')} value={updated} /> : null}
          <MetadataLine colors={colors} label="ID" mono value={job.id} />
        </View>
      </View>
    </View>
  );
}

function AutomationActions({
  job,
  colors,
  actionKey,
  onAction,
  onEdit,
  onRequestDelete,
}: {
  job: SessionAutomationJob;
  colors: Palette;
  actionKey: string | null;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => Promise<void>;
  onEdit: () => void;
  onRequestDelete: () => void;
}) {
  const { t } = useTranslation();
  if (job.protected) {
    return (
      <View style={[styles.protectedBadge, { backgroundColor: colors.pressed }]}>
        <Text style={[styles.protectedText, { color: colors.muted }]}>{t('settings.automations.protected')}</Text>
      </View>
    );
  }
  const local = isLocalTrigger(job);
  const hasLinkedChat = Boolean(job.origin);
  const canRun = hasLinkedChat && job.enabled && !job.state.pending && !local;
  const toggle: AutomationAction = job.enabled ? 'disable' : 'enable';
  const canToggle = job.enabled || hasLinkedChat;
  return (
    <View style={[styles.actionGroup, { backgroundColor: colors.background }]}>
      <RoundAction accessibilityLabel={t('settings.automations.edit')} colors={colors} disabled={Boolean(actionKey)} onPress={onEdit}>
        <Pencil color={colors.muted} size={16} strokeWidth={1.8} />
      </RoundAction>
      {!local ? (
        <RoundAction
          accessibilityLabel={t('settings.automations.runNow')}
          busy={actionKey === `run:${job.id}`}
          colors={colors}
          disabled={!canRun || Boolean(actionKey)}
          onPress={() => void onAction('run', job)}
        >
          <PlayCircle color={colors.muted} size={17} strokeWidth={1.8} />
        </RoundAction>
      ) : null}
      <RoundAction
        accessibilityLabel={job.enabled ? t('settings.automations.pause') : t('settings.automations.resume')}
        busy={actionKey === `${toggle}:${job.id}`}
        colors={colors}
        disabled={!canToggle || Boolean(actionKey)}
        onPress={() => void onAction(toggle, job)}
      >
        {job.enabled
          ? <PauseCircle color={colors.muted} size={17} strokeWidth={1.8} />
          : <PlayCircle color={colors.muted} size={17} strokeWidth={1.8} />}
      </RoundAction>
      <RoundAction accessibilityLabel={t('settings.automations.delete')} colors={colors} danger disabled={Boolean(actionKey)} onPress={onRequestDelete}>
        <Trash2 color={colors.errorText} size={16} strokeWidth={1.8} />
      </RoundAction>
    </View>
  );
}

function RoundAction({
  accessibilityLabel,
  colors,
  children,
  disabled,
  danger = false,
  busy = false,
  onPress,
}: {
  accessibilityLabel: string;
  colors: Palette;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roundAction,
        pressed && { backgroundColor: danger ? colors.errorBackground : colors.pressed },
        disabled && styles.disabled,
      ]}
    >
      {busy ? <ActivityIndicator color={danger ? colors.errorText : colors.muted} size="small" /> : children}
    </Pressable>
  );
}

function DetailCard({
  colors,
  label,
  value,
  title,
  onPress,
}: {
  colors: Palette;
  label: string;
  value: string;
  title?: string;
  onPress?: () => void;
}) {
  const body = (
    <View style={[styles.detailCard, { backgroundColor: colors.background }]}>
      <Text style={[styles.detailLabel, { color: colors.subtle }]}>{label}</Text>
      <View style={styles.detailCardValueRow}>
        <Text numberOfLines={2} style={[styles.detailCardValue, { color: colors.foreground }]}>{value}</Text>
        {onPress ? <ExternalLink color={colors.muted} size={13} strokeWidth={1.8} /> : null}
      </View>
      {title && title !== value ? <Text numberOfLines={1} style={[styles.detailSecondary, { color: colors.muted }]}>{title}</Text> : null}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="link" onPress={onPress} style={styles.detailCardFlex}>{body}</Pressable> : <View style={styles.detailCardFlex}>{body}</View>;
}

function MetadataLine({ colors, label, value, mono = false }: { colors: Palette; label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.metadataLine}>
      <Text style={[styles.metadataLabel, { color: colors.subtle }]}>{label}</Text>
      <Text selectable style={[styles.metadataValue, mono && styles.mono, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function StatusBadge({ colors, tone = 'neutral', children }: { colors: Palette; tone?: 'neutral' | 'success' | 'warning'; children: React.ReactNode }) {
  const backgroundColor = tone === 'success' ? '#FCE8D6' : tone === 'warning' ? '#FFF0C9' : colors.background;
  const color = tone === 'success' ? '#9B5724' : tone === 'warning' ? '#8A631F' : colors.muted;
  return (
    <View style={[styles.statusBadge, { backgroundColor }]}>
      <Text numberOfLines={1} style={[styles.statusBadgeText, { color }]}>{children}</Text>
    </View>
  );
}

function SortSheet({
  visible,
  selected,
  colors,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: AutomationSort;
  colors: Palette;
  onSelect: (sort: AutomationSort) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityLabel={t('settings.automations.closeSort', { defaultValue: 'Close sort options' })} onPress={onClose} style={styles.sheetBackdrop} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={[styles.sheetTitle, { color: colors.muted }]}>{t('settings.automations.sortTitle', { defaultValue: 'Sort by' })}</Text>
          {SORTS.map((item) => (
            <Pressable
              accessibilityState={{ selected: selected === item }}
              key={item}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.pressed }]}
            >
              <Text style={[styles.sheetRowText, { color: colors.foreground }]}>{t(`settings.automations.sort.${item}`)}</Text>
              {selected === item ? <Check color={colors.foreground} size={17} strokeWidth={2} /> : null}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function AutomationEditModal({
  job,
  saving,
  colors,
  onClose,
  onSave,
}: {
  job: SessionAutomationJob | null;
  saving: boolean;
  colors: Palette;
  onClose: () => void;
  onSave: (job: SessionAutomationJob, values: AutomationUpdatePayload) => Promise<void>;
}) {
  if (!job) return null;
  return (
    <AutomationEditSheet
      colors={colors}
      job={job}
      onClose={onClose}
      onSave={onSave}
      saving={saving}
    />
  );
}

function AutomationEditSheet({
  job,
  saving,
  colors,
  onClose,
  onSave,
}: {
  job: SessionAutomationJob;
  saving: boolean;
  colors: Palette;
  onClose: () => void;
  onSave: (job: SessionAutomationJob, values: AutomationUpdatePayload) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [draft, setDraft] = useState<EditDraft>(() => draftFromJob(job));
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  const local = isLocalTrigger(job);
  const validation = editDraftError(draft, job, t);
  const submit = () => {
    const values = updatePayloadFromDraft(draft, job);
    if (typeof values === 'string') return;
    void onSave(job, values);
  };
  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (process.env.EXPO_OS === 'android') setPicker(null);
    if (event.type !== 'set' || !selected) return;
    setDraft((current) => {
      const next = new Date(current.atDate);
      if (picker === 'date') next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      return { ...current, atDate: next };
    });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.editRoot}>
        <Pressable accessibilityLabel={t('settings.automations.closeEdit', { defaultValue: 'Close editor' })} onPress={onClose} style={styles.editBackdrop} />
        <View style={[styles.editCard, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.editHeader}>
            <Text style={[styles.editTitle, { color: colors.foreground }]}>{t('settings.automations.editTitle')}</Text>
            <Pressable accessibilityLabel={t('common.dismiss')} hitSlop={8} onPress={onClose} style={styles.editClose}>
              <X color={colors.muted} size={18} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <FieldLabel colors={colors}>{t('settings.automations.fields.name')}</FieldLabel>
            <TextInput
              accessibilityLabel={t('settings.automations.fields.name')}
              editable={!saving}
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
              placeholder={t('settings.automations.namePlaceholder', { defaultValue: 'Automation name' })}
              placeholderTextColor={colors.subtle}
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={draft.name}
            />

            {!local ? (
              <>
                <FieldLabel colors={colors}>{t('settings.automations.fields.message')}</FieldLabel>
                <TextInput
                  accessibilityLabel={t('settings.automations.fields.message')}
                  editable={!saving}
                  multiline
                  onChangeText={(message) => setDraft((current) => ({ ...current, message }))}
                  placeholder={t('settings.automations.messagePlaceholder', { defaultValue: 'Message sent when the automation runs' })}
                  placeholderTextColor={colors.subtle}
                  style={[styles.fieldInput, styles.messageInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  textAlignVertical="top"
                  value={draft.message}
                />

                <FieldLabel colors={colors}>{t('settings.automations.fields.scheduleType')}</FieldLabel>
                <View style={[styles.segmented, { backgroundColor: colors.pressed }]}>
                  {(['every', 'cron', 'at'] as ScheduleKind[]).map((kind) => (
                    <Pressable
                      accessibilityState={{ selected: draft.scheduleKind === kind }}
                      key={kind}
                      onPress={() => setDraft((current) => ({ ...current, scheduleKind: kind }))}
                      style={[styles.segment, draft.scheduleKind === kind && { backgroundColor: colors.card }]}
                    >
                      <Text style={[styles.segmentText, { color: draft.scheduleKind === kind ? colors.foreground : colors.muted }]}>
                        {t(`settings.automations.scheduleTypes.${kind}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {draft.scheduleKind === 'every' ? (
                  <>
                    <FieldLabel colors={colors}>{t('settings.automations.fields.every')}</FieldLabel>
                    <View style={styles.intervalRow}>
                      <TextInput
                        accessibilityLabel={t('settings.automations.fields.every')}
                        editable={!saving}
                        keyboardType="number-pad"
                        onChangeText={(everyValue) => setDraft((current) => ({ ...current, everyValue }))}
                        style={[styles.fieldInput, styles.intervalValue, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                        value={draft.everyValue}
                      />
                      <View style={styles.unitRow}>
                        {EVERY_UNITS.map((unit) => (
                          <Pressable
                            accessibilityState={{ selected: draft.everyUnit === unit.key }}
                            key={unit.key}
                            onPress={() => setDraft((current) => ({ ...current, everyUnit: unit.key }))}
                            style={[styles.unitButton, { borderColor: colors.border, backgroundColor: draft.everyUnit === unit.key ? colors.pressed : colors.background }]}
                          >
                            <Text style={[styles.unitText, { color: draft.everyUnit === unit.key ? colors.foreground : colors.muted }]}>
                              {t(`settings.automations.everyUnits.${unit.key}`)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </>
                ) : draft.scheduleKind === 'cron' ? (
                  <>
                    <FieldLabel colors={colors}>{t('settings.automations.fields.cronExpression')}</FieldLabel>
                    <TextInput
                      accessibilityLabel={t('settings.automations.fields.cronExpression')}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!saving}
                      onChangeText={(cronExpr) => setDraft((current) => ({ ...current, cronExpr }))}
                      placeholder="0 9 * * *"
                      placeholderTextColor={colors.subtle}
                      style={[styles.fieldInput, styles.mono, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      value={draft.cronExpr}
                    />
                    <FieldLabel colors={colors}>
                      {t('settings.automations.timezoneOptional', {
                        defaultValue: '{{timezone}} (optional)',
                        timezone: t('settings.automations.fields.timezone'),
                      })}
                    </FieldLabel>
                    <TextInput
                      accessibilityLabel={t('settings.automations.fields.timezone')}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!saving}
                      onChangeText={(tz) => setDraft((current) => ({ ...current, tz }))}
                      placeholder="Asia/Shanghai"
                      placeholderTextColor={colors.subtle}
                      style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      value={draft.tz}
                    />
                  </>
                ) : (
                  <>
                    <FieldLabel colors={colors}>{t('settings.automations.fields.runAt')}</FieldLabel>
                    <View style={styles.dateTimeRow}>
                      <Pressable
                        accessibilityLabel={t('settings.automations.selectDate', { defaultValue: 'Select date' })}
                        disabled={saving}
                        onPress={() => setPicker('date')}
                        style={[styles.dateTimeButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                      >
                        <Text style={[styles.dateTimeText, { color: colors.foreground }]}>{formatDate(draft.atDate, locale)}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={t('settings.automations.selectTime', { defaultValue: 'Select time' })}
                        disabled={saving}
                        onPress={() => setPicker('time')}
                        style={[styles.dateTimeButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                      >
                        <Text style={[styles.dateTimeText, { color: colors.foreground }]}>{formatTime(draft.atDate, locale)}</Text>
                      </Pressable>
                    </View>
                    {picker ? (
                      <View style={styles.pickerWrap}>
                        <DateTimePicker
                          display={process.env.EXPO_OS === 'ios' ? 'spinner' : 'default'}
                          mode={picker}
                          onChange={onPickerChange}
                          value={draft.atDate}
                        />
                      </View>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <Text style={[styles.localHint, { color: colors.muted }]}>
                {t('settings.automations.localEditHint', {
                  defaultValue: 'The system manages this local trigger command and conditions. Only its name can be edited here.',
                })}
              </Text>
            )}

            {validation ? <Text style={[styles.validationText, { color: colors.errorText }]}>{validation}</Text> : null}
          </ScrollView>
          <View style={[styles.editActions, { borderTopColor: colors.border }]}>
            <Pressable disabled={saving} onPress={onClose} style={[styles.editButton, { backgroundColor: colors.pressed }]}>
              <Text style={[styles.editButtonText, { color: colors.foreground }]}>{t('settings.automations.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('settings.automations.save')}
              disabled={Boolean(validation) || saving}
              onPress={submit}
              style={[styles.editButton, styles.saveButton, { backgroundColor: colors.foreground }, (validation || saving) && styles.disabled]}
            >
              {saving ? <ActivityIndicator color={colors.background} size="small" /> : <Text style={[styles.saveButtonText, { color: colors.background }]}>{t('settings.automations.save')}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FieldLabel({ colors, children }: { colors: Palette; children: React.ReactNode }) {
  return <Text style={[styles.fieldLabel, { color: colors.muted }]}>{children}</Text>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isLocalTrigger(job: SessionAutomationJob | null): boolean {
  return Boolean(job && (job.kind === 'local_trigger' || job.payload.kind === 'local_trigger' || job.schedule.kind === 'local'));
}

function automationTriggerCommand(job: SessionAutomationJob): string {
  return job.trigger?.command || job.payload.command || job.payload.message || '';
}

function automationSummary(job: SessionAutomationJob, t: TFunction): string {
  if (isLocalTrigger(job)) return automationTriggerCommand(job) || t('settings.automations.localTrigger');
  return job.payload.message || t('settings.automations.systemTask');
}

function automationNeedsAttention(job: SessionAutomationJob): boolean {
  return job.state.last_status === 'error';
}

function automationStatusKey(job: SessionAutomationJob): AutomationStatus {
  if (job.protected) return 'system';
  if (job.state.pending) return 'running';
  if (!job.enabled) return 'paused';
  if (job.state.last_status === 'error') return 'failed';
  if (isLocalTrigger(job)) return 'active';
  if (job.delete_after_run && !job.state.next_run_at_ms && job.state.last_status === 'ok') return 'completed';
  if (!job.state.next_run_at_ms) return 'idle';
  return 'active';
}

function automationStatus(job: SessionAutomationJob, t: TFunction): { label: string; tone: 'neutral' | 'success' | 'warning' } {
  const status = automationStatusKey(job);
  const key = status === 'idle' ? 'noSchedule' : status;
  const tone = status === 'active' ? 'success' : status === 'running' || status === 'failed' ? 'warning' : 'neutral';
  return { label: t(`settings.automations.status.${key}`), tone };
}

function statusDotColor(job: SessionAutomationJob): string {
  const status = automationStatusKey(job);
  if (status === 'active' || status === 'running') return '#F18B43';
  if (status === 'failed') return '#D8A43B';
  return '#A5A39D';
}

function matchesFilter(job: SessionAutomationJob, filter: AutomationFilter): boolean {
  const status = automationStatusKey(job);
  if (filter === 'active') return status === 'active' || status === 'running';
  if (filter === 'paused') return status === 'paused';
  if (filter === 'failed') return automationNeedsAttention(job);
  if (filter === 'system') return Boolean(job.protected);
  return true;
}

function sortJobs(jobs: SessionAutomationJob[], sort: AutomationSort, locale: string): SessionAutomationJob[] {
  const byName = (left: SessionAutomationJob, right: SessionAutomationJob) =>
    (left.name || left.id).localeCompare(right.name || right.id, locale);
  return [...jobs].sort((left, right) => {
    if (sort === 'name') return byName(left, right);
    if (sort === 'last') return (right.state.last_run_at_ms ?? 0) - (left.state.last_run_at_ms ?? 0) || byName(left, right);
    if (sort === 'updated') return (right.updated_at_ms ?? 0) - (left.updated_at_ms ?? 0) || byName(left, right);
    return (left.state.next_run_at_ms ?? Number.MAX_SAFE_INTEGER) - (right.state.next_run_at_ms ?? Number.MAX_SAFE_INTEGER) || byName(left, right);
  });
}

function parseSearchQuery(query: string): SearchToken[] {
  return (query.match(/[^\s:]+:"[^"]+"|"[^"]+"|\S+/g) ?? [])
    .map((raw): SearchToken | null => {
      const part = trimSearchValue(raw);
      if (!part) return null;
      const match = part.match(/^([A-Za-z]+):(.*)$/);
      if (!match) return { field: null, value: part.toLowerCase() };
      const field = match[1].toLowerCase();
      const value = trimSearchValue(match[2]).toLowerCase();
      if (!value) return null;
      return SEARCH_FIELDS.has(field)
        ? { field: field as NonNullable<SearchToken['field']>, value }
        : { field: null, value: part.toLowerCase() };
    })
    .filter((token): token is SearchToken => Boolean(token));
}

function trimSearchValue(value: string): string {
  return value.trim().replace(/^"|"$/g, '').trim();
}

function matchesSearch(job: SessionAutomationJob, tokens: SearchToken[], t: TFunction, locale: string): boolean {
  return tokens.every((token) => searchParts(job, token.field, t, locale)
    .some((part) => String(part ?? '').toLowerCase().includes(token.value)));
}

function searchParts(
  job: SessionAutomationJob,
  field: SearchToken['field'],
  t: TFunction,
  locale: string,
): Array<string | number | null | undefined> {
  const origin = job.origin;
  const originParts = origin ? [origin.session_key, origin.title, origin.preview, origin.channel, channelDisplayName(origin.channel, t)] : [];
  const scheduleParts: Array<string | number | null | undefined> = [
    job.schedule.kind,
    job.schedule.expr,
    job.schedule.tz,
    job.schedule.every_ms,
    job.schedule.at_ms,
    formatSchedule(job, t, locale),
  ];
  if (field === 'id') return [job.id];
  if (field === 'name') return [job.name];
  if (field === 'message') return [job.payload.message, job.payload.command, job.trigger?.command];
  if (field === 'chat') return originParts;
  if (field === 'cron' || field === 'schedule') return scheduleParts;
  if (field === 'status') return [automationStatusKey(job), automationStatus(job, t).label, job.enabled ? 'enabled' : 'disabled'];
  return [
    job.id,
    job.name,
    job.payload.message,
    job.payload.command,
    job.trigger?.command,
    isLocalTrigger(job) ? `trigger local ${t('settings.automations.localTrigger')}` : null,
    ...scheduleParts,
    automationStatusKey(job),
    automationStatus(job, t).label,
    ...originParts,
  ];
}

function channelDisplayName(channel: string, t: TFunction): string {
  const key = channel.trim().toLowerCase();
  if (key === 'websocket') return 'WebUI';
  if (AUTOMATION_CHANNELS.has(key)) return t(`settings.automations.channels.${key}`);
  return channel;
}

function originLabel(job: SessionAutomationJob, t: TFunction): string {
  if (job.protected) return t('settings.automations.origin.system');
  const origin = job.origin;
  if (!origin) return t('settings.automations.origin.unknown');
  if (origin.channel !== 'websocket') return channelDisplayName(origin.channel, t);
  return origin.title || origin.preview || origin.session_key || channelDisplayName(origin.channel, t);
}

function formatSchedule(job: SessionAutomationJob, t: TFunction, locale: string): string {
  if (job.schedule.kind === 'at' && job.schedule.at_ms) {
    return t('settings.automations.schedule.at', { time: formatDateTime(job.schedule.at_ms, locale) });
  }
  if (job.schedule.kind === 'every' && job.schedule.every_ms) {
    return t('settings.automations.schedule.every', { duration: formatInterval(job.schedule.every_ms, t, locale) });
  }
  if (job.schedule.kind === 'cron' && job.schedule.expr) {
    const summary = formatCronSummary(job.schedule.expr, t);
    if (summary) {
      return job.schedule.tz
        ? t('settings.automations.schedule.withTz', { summary, tz: job.schedule.tz })
        : summary;
    }
    return job.schedule.tz
      ? t('settings.automations.schedule.cronWithTz', { expr: job.schedule.expr, tz: job.schedule.tz })
      : t('settings.automations.schedule.cron', { expr: job.schedule.expr });
  }
  if (isLocalTrigger(job)) return t('settings.automations.schedule.local');
  return t('settings.automations.schedule.custom');
}

function formatCronSummary(expr: string, t: TFunction): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const numericMinute = cronNumericToken(minute, 59);
  const numericHour = cronNumericToken(hour, 23);
  const everyDay = dayOfMonth === '*' && month === '*' && dayOfWeek === '*';
  const weekdays = dayOfMonth === '*' && month === '*' && ['1-5', 'MON-FRI', 'mon-fri'].includes(dayOfWeek);
  if (numericMinute !== null && numericHour !== null) {
    const time = `${String(numericHour).padStart(2, '0')}:${String(numericMinute).padStart(2, '0')}`;
    if (everyDay) return t('settings.automations.schedule.dailyAt', { time });
    if (weekdays) return t('settings.automations.schedule.weekdaysAt', { time });
  }
  const paddedMinute = numericMinute === null ? '' : String(numericMinute).padStart(2, '0');
  if (everyDay && numericMinute !== null && hour === '*') {
    return t('settings.automations.schedule.hourlyAt', { minute: paddedMinute });
  }
  const range = /^(\d{1,2})-(\d{1,2})$/.exec(hour);
  if (everyDay && numericMinute !== null && range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start <= 23 && end <= 23) {
      return t('settings.automations.schedule.hourlyWindow', {
        start: String(start).padStart(2, '0'),
        end: String(end).padStart(2, '0'),
        minute: paddedMinute,
      });
    }
  }
  return null;
}

function cronNumericToken(value: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed <= max ? parsed : null;
}

function formatNext(job: SessionAutomationJob, t: TFunction, locale: string): string {
  if (!job.enabled) return t('settings.automations.next.paused');
  if (job.state.pending) return t('settings.automations.next.pending');
  if (isLocalTrigger(job)) return t('settings.automations.next.local');
  if (!job.state.next_run_at_ms) return t('settings.automations.next.none');
  return relativeTimeFromMs(job.state.next_run_at_ms, undefined, locale);
}

function formatNextTitle(job: SessionAutomationJob, t: TFunction, locale: string): string {
  return job.state.next_run_at_ms ? formatDateTime(job.state.next_run_at_ms, locale) : formatNext(job, t, locale);
}

function formatDateTime(ms: number | null | undefined, locale: string): string {
  if (!ms || !Number.isFinite(ms)) return '';
  return safeDateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

function formatDate(date: Date, locale: string): string {
  return safeDateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function formatTime(date: Date, locale: string): string {
  return safeDateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatInterval(ms: number, t: TFunction, locale: string): string {
  const units = [...EVERY_UNITS].reverse();
  for (const unit of units) {
    if (ms >= unit.ms && ms % unit.ms === 0) {
      return `${safeNumberFormat(locale).format(ms / unit.ms)} ${t(`settings.automations.everyUnits.${unit.key}`)}`;
    }
  }
  const unit = ms < 60_000 ? EVERY_UNITS[0] : EVERY_UNITS[1];
  const value = ms / unit.ms;
  return `${safeNumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${t(`settings.automations.everyUnits.${unit.key}`)}`;
}

function messageNeedsExpansion(message: string): boolean {
  return message.length > 360 || message.split(/\r?\n/).length > 6;
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

function draftFromJob(job: SessionAutomationJob | null): EditDraft {
  const every = intervalDraft(job?.schedule.every_ms ?? 3_600_000);
  const kind: ScheduleKind = job?.schedule.kind === 'at' || job?.schedule.kind === 'cron' ? job.schedule.kind : 'every';
  return {
    name: job?.name ?? '',
    message: job?.payload.message ?? '',
    scheduleKind: kind,
    everyValue: every.value,
    everyUnit: every.unit,
    cronExpr: job?.schedule.expr ?? '0 9 * * *',
    tz: job?.schedule.tz ?? '',
    atDate: new Date(job?.schedule.at_ms ?? Date.now() + 3_600_000),
  };
}

function intervalDraft(ms: number): { value: string; unit: EveryUnit } {
  for (const unit of [...EVERY_UNITS].reverse()) {
    if (ms >= unit.ms && ms % unit.ms === 0) return { value: String(ms / unit.ms), unit: unit.key };
  }
  return { value: String(Math.max(1, Math.round(ms / 60_000))), unit: 'minute' };
}

function editDraftError(draft: EditDraft, job: SessionAutomationJob, t: TFunction): string | null {
  if (!draft.name.trim()) return t('settings.automations.validation.nameRequired');
  if (isLocalTrigger(job)) return null;
  if (!draft.message.trim()) return t('settings.automations.validation.messageRequired');
  if (draft.scheduleKind === 'every') {
    const value = Number(draft.everyValue);
    if (!Number.isInteger(value) || value <= 0) return t('settings.automations.validation.intervalRequired');
  }
  if (draft.scheduleKind === 'cron' && !draft.cronExpr.trim()) return t('settings.automations.validation.cronRequired');
  if (draft.scheduleKind === 'at') {
    const atMs = draft.atDate.getTime();
    if (!Number.isFinite(atMs)) return t('settings.automations.validation.timeRequired');
    if (atMs <= Date.now() && scheduleChanged(draft, job)) return t('settings.automations.validation.futureRequired');
  }
  return null;
}

function scheduleFromDraft(draft: EditDraft): NonNullable<AutomationUpdatePayload['schedule']> | string {
  if (draft.scheduleKind === 'every') {
    const unit = EVERY_UNITS.find((candidate) => candidate.key === draft.everyUnit);
    const value = Number(draft.everyValue);
    if (!unit || !Number.isInteger(value) || value <= 0) return 'invalid';
    return { kind: 'every', every_ms: value * unit.ms };
  }
  if (draft.scheduleKind === 'cron') {
    const expr = draft.cronExpr.trim();
    if (!expr) return 'invalid';
    return { kind: 'cron', expr, ...(draft.tz.trim() ? { tz: draft.tz.trim() } : {}) };
  }
  const atMs = draft.atDate.getTime();
  return Number.isFinite(atMs) ? { kind: 'at', at_ms: atMs } : 'invalid';
}

function scheduleChanged(
  draft: EditDraft,
  job: SessionAutomationJob,
  schedule: NonNullable<AutomationUpdatePayload['schedule']> | string = scheduleFromDraft(draft),
): boolean {
  if (typeof schedule === 'string') return true;
  if (schedule.kind !== job.schedule.kind) return true;
  if (schedule.kind === 'every') return schedule.every_ms !== job.schedule.every_ms;
  if (schedule.kind === 'cron') return schedule.expr !== (job.schedule.expr ?? '') || (schedule.tz ?? null) !== (job.schedule.tz ?? null);
  return schedule.at_ms !== job.schedule.at_ms;
}

function updatePayloadFromDraft(draft: EditDraft, job: SessionAutomationJob): AutomationUpdatePayload | string {
  const name = draft.name.trim();
  if (isLocalTrigger(job)) return name ? { name } : 'invalid';
  const message = draft.message.trim();
  if (!name || !message) return 'invalid';
  const values: AutomationUpdatePayload = { name, message };
  const schedule = scheduleFromDraft(draft);
  if (typeof schedule === 'string') return schedule;
  if (scheduleChanged(draft, job, schedule)) values.schedule = schedule;
  return values;
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
  jobRow: { minHeight: 116, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  jobMain: { flex: 1, minWidth: 0 },
  jobNameRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  jobName: { flex: 1, fontSize: 13.5, fontWeight: '700' },
  jobSummary: { marginTop: 7, fontSize: 12, lineHeight: 18 },
  jobMetaRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  jobMeta: { maxWidth: '46%', fontSize: 10.5 },
  jobMetaDot: { fontSize: 10 },
  jobBadges: { alignItems: 'flex-end', gap: 5 },
  oneTime: { fontSize: 10.5 },
  detailSection: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 18, gap: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailHeaderCopy: { flex: 1, minWidth: 0 },
  detailTitle: { fontSize: 21, lineHeight: 27, fontWeight: '700' },
  detailBadges: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusBadge: { minHeight: 24, maxWidth: 190, borderRadius: 12, paddingHorizontal: 9, justifyContent: 'center' },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  protectedBadge: { height: 36, borderRadius: 18, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  protectedText: { fontSize: 12, fontWeight: '600' },
  actionGroup: { borderRadius: 20, padding: 3, flexDirection: 'row' },
  roundAction: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.42 },
  messageCard: { borderRadius: 17, paddingHorizontal: 13, paddingVertical: 12 },
  detailLabel: { fontSize: 11, fontWeight: '600' },
  messageText: { marginTop: 7, fontSize: 13, lineHeight: 20 },
  expandButton: { marginTop: 7, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
  expandText: { fontSize: 12, fontWeight: '600' },
  detailGrid: { flexDirection: 'row', gap: 9 },
  detailCardFlex: { flex: 1, minWidth: 0 },
  detailCard: { minHeight: 80, borderRadius: 17, paddingHorizontal: 12, paddingVertical: 11 },
  detailCardValueRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailCardValue: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  detailSecondary: { marginTop: 2, fontSize: 10.5 },
  lastError: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  lastErrorText: { fontSize: 12, lineHeight: 18 },
  metadataArea: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 13, gap: 10 },
  metadataCard: { borderRadius: 18, padding: 13, gap: 14 },
  metadataLine: { gap: 5 },
  metadataLabel: { fontSize: 10.5 },
  metadataValue: { fontSize: 12.5, lineHeight: 18 },
  mono: { fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' },
  emptyCard: { minHeight: 180, borderRadius: 22, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', gap: 9 },
  emptyTitle: { fontSize: 13, textAlign: 'center' },
  emptyHint: { maxWidth: 320, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,16,14,0.28)' },
  sheet: { borderTopLeftRadius: 23, borderTopRightRadius: 23, paddingHorizontal: 12, paddingTop: 15, elevation: 26 },
  sheetTitle: { paddingHorizontal: 12, paddingBottom: 8, fontSize: 12, fontWeight: '600' },
  sheetRow: { height: 50, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetRowText: { fontSize: 15, fontWeight: '500' },
  editRoot: { flex: 1, justifyContent: 'flex-end' },
  editBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,16,14,0.3)' },
  editCard: { maxHeight: '92%', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 17, paddingTop: 16, elevation: 30 },
  editHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  editTitle: { fontSize: 20, fontWeight: '700' },
  editClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  editContent: { paddingTop: 10, paddingBottom: 18 },
  fieldLabel: { marginTop: 15, marginBottom: 7, fontSize: 12, fontWeight: '600' },
  fieldInput: { minHeight: 45, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 12, fontSize: 14 },
  messageInput: { minHeight: 100, paddingTop: 11, paddingBottom: 11 },
  segmented: { height: 42, borderRadius: 14, padding: 4, flexDirection: 'row', gap: 3 },
  segment: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 12, fontWeight: '600' },
  intervalRow: { gap: 9 },
  intervalValue: { width: '100%' },
  unitRow: { flexDirection: 'row', gap: 6 },
  unitButton: { flex: 1, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontSize: 11.5, fontWeight: '600' },
  dateTimeRow: { flexDirection: 'row', gap: 9 },
  dateTimeButton: { flex: 1, height: 45, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dateTimeText: { fontSize: 13, fontWeight: '600' },
  pickerWrap: { marginTop: 8, alignItems: 'center' },
  localHint: { marginTop: 17, fontSize: 12.5, lineHeight: 19 },
  validationText: { marginTop: 12, fontSize: 12, lineHeight: 18 },
  editActions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  editButton: { minWidth: 86, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  editButtonText: { fontSize: 14, fontWeight: '600' },
  saveButton: { minWidth: 96 },
  saveButtonText: { fontSize: 14, fontWeight: '700' },
});
