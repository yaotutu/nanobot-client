import { CalendarClock, CircleAlert, RefreshCcw, X } from 'lucide-react-native';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDateTime, relativeTimeFromMs, safeNumberFormat } from '@/services/text/format';
import type { SessionAutomationJob } from '@/types/api';

const AUTOMATIONS_REFRESH_MS = 3_000;

interface SessionInfoColors {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
  errorBackground: string;
  errorText: string;
}

interface SessionInfoModalProps {
  colors: SessionInfoColors;
  loadJobs: (sessionKey: string) => Promise<SessionAutomationJob[]>;
  onClose: () => void;
  sessionKey: string | null;
  title: string;
  visible: boolean;
}

export function SessionInfoModal({
  colors,
  loadJobs,
  onClose,
  sessionKey,
  title,
  visible,
}: SessionInfoModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<SessionAutomationJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
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

  useEffect(() => {
    if (!visible) return;
    const initialTickId = setTimeout(() => setNow(Date.now()), 0);
    const tickId = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearTimeout(initialTickId);
      clearInterval(tickId);
    };
  }, [visible]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable accessibilityLabel={t('thread.header.sessionInfo')} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          <View style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.titleRow}>
            <View style={styles.titleArea}>
              <Text style={[styles.eyebrow, { color: colors.subtle }]}>{t('thread.sessionInfo.title')}</Text>
              <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
                {title || t('thread.sessionInfo.untitled')}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t('thread.header.sessionInfo')}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <X color={colors.muted} size={18} strokeWidth={1.8} />
            </Pressable>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.automationHeader}>
            <View style={styles.automationHeaderTitle}>
              <CalendarClock color={colors.muted} size={16} strokeWidth={1.8} />
              <Text style={[styles.automationTitle, { color: colors.foreground }]}>{t('thread.sessionInfo.automations')}</Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: colors.pressed }]}>
              <Text style={[styles.countText, { color: colors.muted }]}>{t('thread.sessionInfo.count', { count: jobs.length })}</Text>
            </View>
          </View>

          {loading ? (
            <View style={[styles.statusCard, { backgroundColor: colors.pressed }]}>
              <ActivityIndicator color={colors.muted} size="small" />
              <Text style={[styles.statusText, { color: colors.muted }]}>{t('thread.sessionInfo.loading')}</Text>
            </View>
          ) : loadFailed ? (
            <View style={[styles.statusCard, { backgroundColor: colors.errorBackground }]}>
              <CircleAlert color={colors.errorText} size={16} strokeWidth={1.8} />
              <Text style={[styles.statusText, { color: colors.errorText }]}>{t('thread.sessionInfo.loadFailed')}</Text>
            </View>
          ) : jobs.length ? (
            <FlatList
              contentContainerStyle={styles.jobsContent}
              data={jobs}
              keyExtractor={(job) => job.id}
              renderItem={({ item }) => (
                <AutomationRow colors={colors} job={item} now={now} />
              )}
              showsVerticalScrollIndicator={false}
              style={styles.jobsList}
            />
          ) : (
            <View style={[styles.statusCard, { backgroundColor: colors.pressed }]}>
              <RefreshCcw color={colors.subtle} size={15} strokeWidth={1.8} />
              <Text style={[styles.statusText, { color: colors.muted }]}>{t('thread.sessionInfo.empty')}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function AutomationRow({
  colors,
  job,
  now,
}: {
  colors: SessionInfoColors;
  job: SessionAutomationJob;
  now: number;
}) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const statusColor = !job.enabled
    ? colors.subtle
    : job.state.last_status === 'error'
      ? colors.errorText
      : '#22A06B';
  return (
    <View style={[styles.jobRow, { backgroundColor: colors.card }]}>
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      <View style={styles.jobBody}>
        <View style={styles.jobTitleRow}>
          <Text numberOfLines={1} style={[styles.jobName, { color: colors.foreground }]}>{job.name}</Text>
          {!job.enabled ? (
            <View style={[styles.disabledBadge, { backgroundColor: colors.pressed }]}>
              <Text style={[styles.disabledText, { color: colors.muted }]}>{t('thread.sessionInfo.disabled')}</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={2} style={[styles.jobMessage, { color: colors.muted }]}>
          {job.payload.message}
        </Text>
        <Text numberOfLines={2} style={[styles.jobMeta, { color: colors.subtle }]}>
          {formatSchedule(job, t, locale)} · {formatNextRun(job, t, now, locale)}
        </Text>
      </View>
    </View>
  );
}

function formatSchedule(job: SessionAutomationJob, t: TFunction, locale: string): string {
  if (isLocalTriggerAutomation(job)) return t('thread.sessionInfo.schedule.local');
  if (job.schedule.kind === 'at' && job.schedule.at_ms) {
    return t('thread.sessionInfo.schedule.at', { time: formatDateTime(job.schedule.at_ms, locale) });
  }
  if (job.schedule.kind === 'every' && job.schedule.every_ms) {
    return t('thread.sessionInfo.schedule.every', { duration: formatDuration(job.schedule.every_ms, locale) });
  }
  if (job.schedule.kind === 'cron' && job.schedule.expr) {
    return job.schedule.tz
      ? t('thread.sessionInfo.schedule.cronWithTz', { expr: job.schedule.expr, tz: job.schedule.tz })
      : t('thread.sessionInfo.schedule.cron', { expr: job.schedule.expr });
  }
  return t('thread.sessionInfo.schedule.unknown');
}

function formatNextRun(job: SessionAutomationJob, t: TFunction, now: number, locale: string): string {
  if (!job.enabled) return t('thread.sessionInfo.next.disabled');
  if (job.state.pending) return t('thread.sessionInfo.next.pending');
  if (isLocalTriggerAutomation(job)) return t('thread.sessionInfo.next.local');
  const next = job.state.next_run_at_ms;
  if (!next) return t('thread.sessionInfo.next.none');
  return t('thread.sessionInfo.next.label', { time: relativeTimeFrom(next, now, locale) });
}

function isLocalTriggerAutomation(job: SessionAutomationJob): boolean {
  return job.kind === 'local_trigger'
    || job.payload.kind === 'local_trigger'
    || job.schedule.kind === 'local';
}

function relativeTimeFrom(value: number, _now: number, locale: string): string {
  return relativeTimeFromMs(value, undefined, locale);
}

function formatDuration(ms: number, locale: string): string {
  const units: Array<[Intl.NumberFormatOptions['unit'], number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
  ];
  for (const [unit, size] of units) {
    if (ms >= size && ms % size === 0) {
      return safeNumberFormat(locale, { style: 'unit' as const, unit, unitDisplay: 'long' as const }).format(ms / size);
    }
  }
  return safeNumberFormat(locale, {
    style: 'unit' as const,
    unit: 'minute',
    unitDisplay: 'long' as const,
    maximumFractionDigits: 1,
  }).format(ms / 60_000);
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.28)' },
  sheet: {
    maxHeight: '78%',
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  handleArea: { height: 25, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 38, height: 4, borderRadius: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleArea: { minWidth: 0, flex: 1 },
  eyebrow: { fontSize: 11.5 },
  title: { marginTop: 3, fontSize: 15, fontWeight: '600' },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  automationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  automationHeaderTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  automationTitle: { fontSize: 14, fontWeight: '600' },
  countBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  countText: { fontSize: 11 },
  statusCard: { minHeight: 48, borderRadius: 16, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusText: { minWidth: 0, flex: 1, fontSize: 12.5, lineHeight: 18 },
  jobsList: { minHeight: 64 },
  jobsContent: { gap: 6, paddingBottom: 2 },
  jobRow: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  jobBody: { minWidth: 0, flex: 1 },
  jobTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  jobName: { minWidth: 0, flex: 1, fontSize: 13.5, fontWeight: '600' },
  disabledBadge: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2 },
  disabledText: { fontSize: 10.5 },
  jobMessage: { marginTop: 5, fontSize: 12, lineHeight: 17 },
  jobMeta: { marginTop: 7, fontSize: 11, lineHeight: 16 },
});
