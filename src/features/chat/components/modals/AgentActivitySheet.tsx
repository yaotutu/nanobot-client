import ActivityIcon from 'lucide-react-native/icons/activity';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import FileClock from 'lucide-react-native/icons/file-clock';
import RefreshCw from 'lucide-react-native/icons/rotate-cw';
import X from 'lucide-react-native/icons/x';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityMessage } from '@/features/chat/components/activity/ActivityMessage';
import {
  deriveAgentActivityPanel,
} from '@/features/chat/activity/model/header-activity';
import type { TurnUnit } from '@/features/chat/activity/model/activity-timeline';
import {
  formatSessionNextRun,
  formatSessionSchedule,
} from '@/features/chat/activity/model/session-automations';
import { formatDuration } from '@/features/chat/activity/model/activity-format';
import { useSessionAutomations } from '@/features/chat/hooks/use-session-automations';
import { fetchSessionAutomations } from '@/features/chat/api/session-automations';
import type { Palette } from '@/ui/palette';
import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type { SessionAutomationJob } from '@/types/api/automations';

type ActivitySheetTab = 'activity' | 'files' | 'automations';

interface AgentActivitySheetProps {
  cliApps: CliAppInfo[];
  colors: Palette;
  mcpPresets: McpPresetInfo[];
  onOpenFilePreview?: (path: string) => void;
  sessionKey: string | null;
  turnActive: boolean;
  units: TurnUnit[];
  visible: boolean;
  onClose: () => void;
}

/** Agent 活动二级面板：活动、文件、当前会话绑定的定时任务。 */
export function AgentActivitySheet({
  cliApps,
  colors,
  mcpPresets,
  onOpenFilePreview,
  sessionKey,
  turnActive,
  units,
  visible,
  onClose,
}: AgentActivitySheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ActivitySheetTab>('activity');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const panel = useMemo(() => deriveAgentActivityPanel(
    units,
    turnActive,
    cliApps,
    mcpPresets,
  ), [cliApps, mcpPresets, turnActive, units]);
  // 面板内运行时长每秒刷新；这属于 UI 呈现，不改变消息模型。
  useEffect(() => {
    if (!turnActive) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [turnActive]);

  const automations = useSessionAutomations({
    loadJobs: fetchSessionAutomations,
    sessionKey,
    visible: visible && tab === 'automations',
  });

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable accessibilityLabel={t('thread.agentActivity.close')} onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityLabel={t('thread.agentActivity.title')}
          onPress={(event) => event.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 10,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerBody}>
              <Text style={[styles.title, { color: colors.foreground }]}>{t('thread.agentActivity.title')}</Text>
              <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>
                {t(turnActive ? 'thread.agentActivity.running' : 'thread.agentActivity.idle')}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t('thread.agentActivity.close')}
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? colors.pressed : colors.card }]}
            >
              <X color={colors.muted} size={18} strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={styles.tabs}>
            {([
              ['activity', ActivityIcon, t('thread.agentActivity.tabs.activity')],
              ['files', FileClock, t('thread.agentActivity.tabs.files')],
              ['automations', CalendarClock, t('thread.agentActivity.tabs.automations')],
            ] as const).map(([key, Icon, label]) => (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
                key={key}
                onPress={() => setTab(key)}
                style={({ pressed }) => [
                  styles.tab,
                  {
                    backgroundColor: tab === key || pressed
                      ? colors.pressed
                      : colors.card,
                  },
                ]}
              >
                <Icon color={tab === key ? colors.foreground : colors.muted} size={14} strokeWidth={1.8} />
                <Text
                  numberOfLines={1}
                  style={[styles.tabText, { color: tab === key ? colors.foreground : colors.muted }]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            style={styles.contentScroll}
          >
            {tab === 'activity' ? (
              <ActivityTab
                cliApps={cliApps}
                colors={colors}
                mcpPresets={mcpPresets}
                panel={panel}
                nowMs={nowMs}
                turnActive={turnActive}
              />
            ) : null}
            {tab === 'files' ? (
              <FilesTab
                colors={colors}
                edits={panel.fileEdits}
                onOpenFilePreview={onOpenFilePreview}
              />
            ) : null}
            {tab === 'automations' ? (
              <AutomationsTab
                colors={colors}
                jobs={automations.jobs}
                loadFailed={automations.loadFailed}
                loading={automations.loading}
                onRefresh={() => void automations.refresh()}
              />
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActivityTab({
  cliApps,
  colors,
  mcpPresets,
  nowMs,
  panel,
  turnActive,
}: {
  cliApps: CliAppInfo[];
  nowMs: number;
  colors: Palette;
  mcpPresets: McpPresetInfo[];
  panel: ReturnType<typeof deriveAgentActivityPanel>;
  turnActive: boolean;
}) {
  const { t } = useTranslation();
  const cliAppsByName = useMemo(
    () => new Map(cliApps.map((app) => [app.name.toLowerCase(), app])),
    [cliApps],
  );
  const mcpPresetsByName = useMemo(
    () => new Map(mcpPresets.map((preset) => [preset.name.toLowerCase(), preset])),
    [mcpPresets],
  );
  const duration = panel.startedAtMs !== undefined
    ? formatDuration(Math.max(0, nowMs - panel.startedAtMs))
    : undefined;
  const summaryParts = [
    duration ? t('thread.agentActivity.elapsed', { duration }) : undefined,
    panel.toolCallCount ? t('thread.agentActivity.toolCount', { count: panel.toolCallCount }) : undefined,
    panel.fileEdits.length ? t('thread.agentActivity.fileCount', { count: panel.fileEdits.length }) : undefined,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.panelStack}>
      <View style={[styles.summary, { backgroundColor: colors.card }]}>
        <Text style={[styles.summaryTitle, { color: colors.foreground }]}>
          {t(turnActive ? 'thread.agentActivity.summaryRunning' : 'thread.agentActivity.summaryIdle')}
        </Text>
        {summaryParts ? (
          <Text style={[styles.summaryDetail, { color: colors.muted }]}>{summaryParts}</Text>
        ) : null}
      </View>

      {panel.userPrompt ? (
        <TimelineStep
          colors={colors}
          detail={panel.userPrompt}
          label={t('thread.agentActivity.userMessage')}
          status="done"
        />
      ) : null}

      {panel.activityMessages.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          {t('thread.agentActivity.emptyActivity')}
        </Text>
      ) : panel.activityMessages.map((message, index) => {
        const active = turnActive && index === panel.activityMessages.length - 1;
        return (
          <View key={message.id} style={styles.timelineStack}>
            <ActivityMessage
              active={active}
              cliAppsByName={cliAppsByName}
              colors={colors}
              mcpPresetsByName={mcpPresetsByName}
              message={message}
            />
          </View>
        );
      })}
      {panel.fileEdits.length ? (
        <TimelineStep
          colors={colors}
          detail={panel.fileEdits.map((edit) => edit.path).filter(Boolean).join('\n')}
          label={t('thread.agentActivity.fileSummary', { count: panel.fileEdits.length })}
          status={turnActive ? 'running' : 'done'}
        />
      ) : null}
    </View>
  );
}

function FilesTab({
  colors,
  edits,
  onOpenFilePreview,
}: {
  colors: Palette;
  edits: ReturnType<typeof deriveAgentActivityPanel>['fileEdits'];
  onOpenFilePreview?: (path: string) => void;
}) {
  const { t } = useTranslation();
  if (!edits.length) {
    return <Text style={[styles.emptyText, { color: colors.muted }]}>{t('thread.agentActivity.emptyFiles')}</Text>;
  }
  return (
    <View style={styles.panelStack}>
      {edits.map((edit) => (
        <View key={edit.key} style={[styles.fileCard, { backgroundColor: colors.card }]}>
          <View style={styles.fileBody}>
            <Text numberOfLines={1} style={[styles.filePath, { color: colors.foreground }]}>
              {edit.path}
            </Text>
            <Text style={[styles.fileMeta, { color: colors.muted }]}>
              {t(`thread.agentActivity.fileStatus.${edit.status}`, {
                count: Math.max(1, (edit.added || 0) + (edit.deleted || 0)),
              })}
            </Text>
            {edit.error ? <Text style={[styles.errorText, { color: colors.errorText }]}>{edit.error}</Text> : null}
          </View>
          {onOpenFilePreview && edit.path ? (
            <Pressable
              accessibilityLabel={t('thread.agentActivity.preview', { path: edit.path })}
              accessibilityRole="button"
              onPress={() => onOpenFilePreview(edit.path)}
              style={({ pressed }) => [styles.previewButton, { backgroundColor: pressed ? colors.pressed : colors.background }]}
            >
              <Text style={[styles.previewText, { color: colors.foreground }]}>
                {t('thread.agentActivity.previewShort')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function AutomationsTab({
  colors,
  jobs,
  loadFailed,
  loading,
  onRefresh,
}: {
  colors: Palette;
  jobs: SessionAutomationJob[];
  loadFailed: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;

  return (
    <View style={styles.panelStack}>
      <View style={styles.automationHeader}>
        <Text style={[styles.summaryTitle, { color: colors.foreground }]}>
          {t('thread.agentActivity.automationsTitle', { count: jobs.length })}
        </Text>
        <Pressable
          accessibilityLabel={t('thread.agentActivity.refresh')}
          accessibilityRole="button"
          disabled={loading}
          onPress={onRefresh}
          style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? colors.pressed : colors.card }]}
        >
          {loading
            ? <ActivityIndicator color={colors.muted} size="small" />
            : <RefreshCw color={colors.muted} size={15} strokeWidth={1.8} />}
        </Pressable>
      </View>

      {loadFailed ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground }]}>
          <CircleAlert color={colors.errorText} size={16} strokeWidth={1.8} />
          <Text style={[styles.errorBannerText, { color: colors.errorText }]}>
            {t('thread.sessionInfo.loadFailed')}
          </Text>
        </View>
      ) : null}

      {!loading && !loadFailed && !jobs.length ? (
        <Text style={[styles.emptyText, { color: colors.muted }]}>{t('thread.sessionInfo.empty')}</Text>
      ) : null}

      {jobs.map((job) => (
        <View key={job.id} style={[styles.fileCard, { backgroundColor: colors.card }]}>
          <View style={styles.fileBody}>
            <Text numberOfLines={1} style={[styles.filePath, { color: colors.foreground }]}>{job.name}</Text>
            <Text style={[styles.fileMeta, { color: job.enabled ? colors.foreground : colors.muted }]}>
              {t(job.enabled ? 'thread.agentAutomation.enabled' : 'thread.agentAutomation.disabled')}
              {' · '}
              {formatSessionSchedule(job, t, locale)}
            </Text>
            <Text style={[styles.fileMeta, { color: colors.muted }]}>
              {t('thread.agentAutomation.nextRun')}
              {': '}
              {formatSessionNextRun(job, t, locale)}
            </Text>
            <Text numberOfLines={2} style={[styles.automationMessage, { color: colors.muted }]}>
              {job.payload.message}
            </Text>
            {job.state.last_status ? (
              <Text style={[styles.fileMeta, { color: job.state.last_status === 'error' ? colors.errorText : colors.muted }]}>
                {t('thread.agentAutomation.lastRun', {
                  status: t(`thread.agentAutomation.status.${job.state.last_status}`),
                })}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function TimelineStep({
  colors,
  detail,
  label,
  status,
}: {
  colors: Palette;
  detail: string;
  label: string;
  status: 'running' | 'done' | 'error';
}) {
  const dotColor = status === 'running'
    ? '#2F80ED'
    : status === 'error'
      ? '#DC2626'
      : '#22C55E';
  return (
    <View style={styles.timelineStep}>
      <View style={styles.timelineLine}>
        <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
        <View style={[styles.timelineConnector, { backgroundColor: colors.border }]} />
      </View>
      <View style={[styles.timelineBody, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.timelineLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.timelineDetail, { color: colors.muted }]}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 18 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 14, gap: 8 },
  headerBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -0.3 },
  subtitle: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 9,
  },
  tabText: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  contentScroll: { flex: 0 },
  content: { paddingHorizontal: 18, paddingBottom: 10, gap: 10 },
  panelStack: { gap: 10 },
  timelineStack: { gap: 2 },
  summary: { borderRadius: 18, padding: 14 },
  summaryTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  summaryDetail: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  emptyText: { paddingVertical: 26, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  fileCard: {
    borderRadius: 18,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  fileBody: { flex: 1, minWidth: 0, gap: 3 },
  filePath: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  fileMeta: { fontSize: 11.5, lineHeight: 16 },
  fileError: { fontSize: 11.5, lineHeight: 16 },
  errorText: { fontSize: 11.5, lineHeight: 16 },
  previewButton: {
    minHeight: 34,
    borderRadius: 12,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: { fontSize: 12, fontWeight: '600' },
  automationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  automationMessage: { marginTop: 3, fontSize: 12, lineHeight: 18 },
  errorBanner: {
    borderRadius: 15,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: { flex: 1, fontSize: 12, lineHeight: 17 },
  timelineStep: { flexDirection: 'row', gap: 8 },
  timelineLine: { width: 12, alignItems: 'center', paddingTop: 5 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineConnector: { width: 1, flex: 1, minHeight: 12, marginTop: 3, opacity: 0.5 },
  timelineBody: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
  },
  timelineLabel: { fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  timelineDetail: { marginTop: 2, fontSize: 12, lineHeight: 17 },
});
