import ChevronDown from 'lucide-react-native/icons/chevron-down';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ActivityMessage } from '@/features/chat/components/activity/ActivityMessage';
import { FileEditGroup } from '@/features/chat/components/activity/FileEditGroup';
import { toolRows } from '@/features/chat/activity/model/tool-row-model';
import {
  activityDurationMs,
  collectFileEdits,
  formatDuration,
  messageHasOnlyFileActivity,
  summarizeFileEdits,
  traceLines,
} from '@/features/chat/activity/model/tool-helpers';
import { isReasoningOnlyAssistant } from '@/features/chat/activity/model/activity-timeline';
import { coalesceActivityMessages } from '@/features/chat/activity/model/activity-message-model';
import type { Palette } from '@/ui/palette';
import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type { UIMessage } from '@/types/api/chat/messages';

interface AgentActivityClusterProps {
  cliApps?: CliAppInfo[];
  colors: Palette;
  hasBodyBelow: boolean;
  isTurnStreaming: boolean;
  messages: UIMessage[];
  mcpPresets?: McpPresetInfo[];
  onOpenFilePreview?: (path: string) => void;
  resolveFilePreviewAvailability?: (path: string) => Promise<boolean>;
  startedAtMs?: number;
  turnLatencyMs?: number;
}

const ACTIVITY_SCROLL_NEAR_BOTTOM_PX = 24;

export function AgentActivityCluster({
  cliApps = [],
  colors,
  hasBodyBelow,
  isTurnStreaming,
  messages,
  mcpPresets = [],
  onOpenFilePreview,
  resolveFilePreviewAvailability,
  startedAtMs,
  turnLatencyMs,
}: AgentActivityClusterProps) {
  const { t } = useTranslation();
  const [manualExpanded, setManualExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const activityScrollRef = useRef<ScrollView>(null);
  const autoFollowActivityRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const activityMessages = useMemo(() => coalesceActivityMessages(messages), [messages]);
  const cliAppsByName = useMemo(
    () => new Map(cliApps.map((app) => [app.name.toLowerCase(), app])),
    [cliApps],
  );
  const mcpPresetsByName = useMemo(
    () => new Map(mcpPresets.map((preset) => [preset.name.toLowerCase(), preset])),
    [mcpPresets],
  );
  const fileEdits = useMemo(
    () => summarizeFileEdits(collectFileEdits(activityMessages), isTurnStreaming),
    [activityMessages, isTurnStreaming],
  );
  const hasReasoning = activityMessages.some(isReasoningOnlyAssistant);
  const hasToolActivity = activityMessages.some(
    (message) => traceLines(message).length || message.toolEvents?.length,
  );
  const hasNonReasoningActivity = hasToolActivity || fileEdits.length > 0;
  const toolCallCount = useMemo(
    () => activityMessages.reduce(
      (count, message) => count + toolRows(message, isTurnStreaming, cliAppsByName, mcpPresetsByName).length,
      0,
    ),
    [activityMessages, cliAppsByName, isTurnStreaming, mcpPresetsByName],
  );
  const reasoningStepCount = useMemo(
    () => activityMessages.filter(isReasoningOnlyAssistant).length,
    [activityMessages],
  );
  const hasOnlyFileActivity = fileEdits.length > 0
    && activityMessages.every(messageHasOnlyFileActivity);
  // 消息列表只保留一行轻量摘要；完整过程统一从头部胶囊进入二级面板查看。
  const expanded = manualExpanded;

  const cancelActivityScrollFrame = useCallback(() => {
    if (scrollFrameRef.current === null) return;
    cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
  }, []);

  const scheduleActivityScrollToBottom = useCallback(() => {
    cancelActivityScrollFrame();
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      activityScrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [cancelActivityScrollFrame]);

  const toggleExpanded = useCallback(() => {
    const nextExpanded = !expanded;
    if (nextExpanded) autoFollowActivityRef.current = true;
    setManualExpanded(nextExpanded);
  }, [expanded]);

  const handleActivityScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - contentOffset.y - layoutMeasurement.height;
    autoFollowActivityRef.current = distance < ACTIVITY_SCROLL_NEAR_BOTTOM_PX;
  }, []);

  useEffect(() => {
    if (!isTurnStreaming) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [isTurnStreaming]);

  useEffect(() => {
    if (!expanded) {
      autoFollowActivityRef.current = true;
      return;
    }
    if (autoFollowActivityRef.current) scheduleActivityScrollToBottom();
  }, [activityMessages, expanded, fileEdits, isTurnStreaming, scheduleActivityScrollToBottom]);

  useEffect(() => cancelActivityScrollFrame, [cancelActivityScrollFrame]);

  if (!hasReasoning && !hasNonReasoningActivity) return null;

  if (hasOnlyFileActivity) {
    return (
      <View style={[styles.container, hasBodyBelow && styles.withBodyBelow]}>
        <ActivityClusterHeader
          colors={colors}
          expanded={expanded}
          isTurnStreaming={isTurnStreaming}
          label={clusterLabel({
            hasNonReasoningActivity,
            isTurnStreaming,
            reasoningStepCount,
            t,
            toolCallCount: Math.max(toolCallCount, fileEdits.length),
            durationMs: activityDurationMs(activityMessages, isTurnStreaming, now, turnLatencyMs, startedAtMs),
          })}
          onToggle={toggleExpanded}
        />
        {expanded ? (
          <FileEditGroup
            colors={colors}
            edits={fileEdits}
            onOpenFilePreview={onOpenFilePreview}
            resolveFilePreviewAvailability={resolveFilePreviewAvailability}
          />
        ) : null}
      </View>
    );
  }

  const durationMs = activityDurationMs(
    activityMessages,
    isTurnStreaming,
    now,
    turnLatencyMs,
    startedAtMs,
  );

  return (
    <View style={[styles.container, hasBodyBelow && styles.withBodyBelow]}>
      <ActivityClusterHeader
        colors={colors}
        expanded={expanded}
        isTurnStreaming={isTurnStreaming}
        label={clusterLabel({
          hasNonReasoningActivity,
          isTurnStreaming,
          reasoningStepCount,
          t,
          toolCallCount,
          durationMs,
        })}
        onToggle={toggleExpanded}
      />
      {expanded ? (
        <ScrollView
          contentContainerStyle={styles.timelineContent}
          nestedScrollEnabled
          onContentSizeChange={() => {
            if (autoFollowActivityRef.current) scheduleActivityScrollToBottom();
          }}
          onScroll={handleActivityScroll}
          ref={activityScrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.timeline}
        >
          {activityMessages.map((message, index) => (
            <ActivityMessage
              active={isTurnStreaming && index === activityMessages.length - 1}
              cliAppsByName={cliAppsByName}
              colors={colors}
              key={message.id}
              message={message}
              mcpPresetsByName={mcpPresetsByName}
            />
          ))}
          {fileEdits.length ? (
            <FileEditGroup
              colors={colors}
              edits={fileEdits}
              onOpenFilePreview={onOpenFilePreview}
              resolveFilePreviewAvailability={resolveFilePreviewAvailability}
            />
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}


interface ClusterLabelInput {
  hasNonReasoningActivity: boolean;
  isTurnStreaming: boolean;
  reasoningStepCount: number;
  toolCallCount: number;
  durationMs?: number;
  t: TFunction;
}

/** 轻量摘要保持单一实现，供普通活动与纯文件活动共用。 */
function clusterLabel({
  hasNonReasoningActivity,
  isTurnStreaming,
  durationMs,
  reasoningStepCount,
  toolCallCount,
  t,
}: ClusterLabelInput) {
  if (hasNonReasoningActivity) {
    return isTurnStreaming
      ? (reasoningStepCount
        ? t('message.agentActivityLiveSummary', { reasoning: reasoningStepCount, tools: toolCallCount })
        : t('message.agentActivityLiveToolsOnly', { tools: toolCallCount }))
      : (reasoningStepCount
        ? t('message.agentActivitySummary', { reasoning: reasoningStepCount, tools: toolCallCount })
        : t('message.agentActivityToolsOnly', { tools: toolCallCount }));
  }
  return t(isTurnStreaming
    ? 'message.activityThinkingFor'
    : 'message.activityThoughtFor', { duration: formatDuration(durationMs ?? 0) });
}

function ActivityClusterHeader({
  colors,
  expanded,
  isTurnStreaming,
  label,
  onToggle,
}: {
  colors: Palette;
  expanded: boolean;
  isTurnStreaming: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      hitSlop={10}
      onPress={onToggle}
      style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.pressed }]}
    >
      <Text
        numberOfLines={1}
        style={[styles.headerLabel, { color: isTurnStreaming ? colors.muted : colors.subtle }]}
      >
        {label}
      </Text>
      <ChevronDown
        color={colors.subtle}
        size={13}
        strokeWidth={1.8}
        style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 对齐助手卡片的宽度；列表默认只保留轻量摘要，详细过程由头部活动面板展示。
  container: { width: '95%', maxWidth: 720 },
  withBodyBelow: { marginBottom: 4 },
  header: {
    // 24px 可视高度配合 10px hitSlop，尽量扩展折叠入口的触摸范围，但不额外撑高活动布局。
    minHeight: 24,
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerLabel: { maxWidth: 270, flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  // 展开后的可滚动视口保持紧凑；完整活动详情有头部二级面板承担。
  timeline: { maxHeight: 144, marginTop: 2 },
  timelineContent: { paddingRight: 3, paddingBottom: 2 },
});
