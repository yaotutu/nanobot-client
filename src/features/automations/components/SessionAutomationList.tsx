import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import RefreshCcw from 'lucide-react-native/icons/refresh-ccw';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSessionAutomations } from '@/features/automations/hooks/use-session-automations';
import {
  formatSessionNextRun,
  formatSessionSchedule,
} from '@/features/automations/model/session-presentation';
import type { SessionAutomationJob } from '@/types/api/automations';

export interface SessionAutomationColors {
  foreground: string;
  muted: string;
  subtle: string;
  card: string;
  pressed: string;
  errorBackground: string;
  errorText: string;
}

interface SessionAutomationListProps {
  colors: SessionAutomationColors;
  loadJobs: (sessionKey: string) => Promise<SessionAutomationJob[]>;
  sessionKey: string | null;
  visible: boolean;
}

export function SessionAutomationList({
  colors,
  loadJobs,
  sessionKey,
  visible,
}: SessionAutomationListProps) {
  const { t } = useTranslation();
  const { jobs, loadFailed, loading } = useSessionAutomations({
    loadJobs,
    sessionKey,
    visible,
  });
  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <CalendarClock color={colors.muted} size={16} strokeWidth={1.8} />
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t('thread.sessionInfo.automations')}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: colors.pressed }]}>
          <Text style={[styles.countText, { color: colors.muted }]}>
            {t('thread.sessionInfo.count', { count: jobs.length })}
          </Text>
        </View>
      </View>

      {loading ? (
        <StatusCard colors={colors} tone="default">
          <ActivityIndicator color={colors.muted} size="small" />
          <Text style={[styles.statusText, { color: colors.muted }]}>
            {t('thread.sessionInfo.loading')}
          </Text>
        </StatusCard>
      ) : loadFailed ? (
        <StatusCard colors={colors} tone="error">
          <CircleAlert color={colors.errorText} size={16} strokeWidth={1.8} />
          <Text style={[styles.statusText, { color: colors.errorText }]}>
            {t('thread.sessionInfo.loadFailed')}
          </Text>
        </StatusCard>
      ) : jobs.length ? (
        <FlatList
          contentContainerStyle={styles.jobsContent}
          data={jobs}
          keyExtractor={(job) => job.id}
          renderItem={({ item }) => <AutomationRow colors={colors} job={item} />}
          showsVerticalScrollIndicator={false}
          style={styles.jobsList}
        />
      ) : (
        <StatusCard colors={colors} tone="default">
          <RefreshCcw color={colors.subtle} size={15} strokeWidth={1.8} />
          <Text style={[styles.statusText, { color: colors.muted }]}>
            {t('thread.sessionInfo.empty')}
          </Text>
        </StatusCard>
      )}
    </>
  );
}

function StatusCard({
  children,
  colors,
  tone,
}: {
  children: React.ReactNode;
  colors: SessionAutomationColors;
  tone: 'default' | 'error';
}) {
  return (
    <View
      style={[
        styles.statusCard,
        { backgroundColor: tone === 'error' ? colors.errorBackground : colors.pressed },
      ]}
    >
      {children}
    </View>
  );
}

function AutomationRow({
  colors,
  job,
}: {
  colors: SessionAutomationColors;
  job: SessionAutomationJob;
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
          <Text numberOfLines={1} style={[styles.jobName, { color: colors.foreground }]}>
            {job.name}
          </Text>
          {!job.enabled ? (
            <View style={[styles.disabledBadge, { backgroundColor: colors.pressed }]}>
              <Text style={[styles.disabledText, { color: colors.muted }]}>
                {t('thread.sessionInfo.disabled')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={2} style={[styles.jobMessage, { color: colors.muted }]}>
          {job.payload.message}
        </Text>
        <Text numberOfLines={2} style={[styles.jobMeta, { color: colors.subtle }]}>
          {formatSessionSchedule(job, t, locale)} · {formatSessionNextRun(job, t, locale)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '600' },
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
