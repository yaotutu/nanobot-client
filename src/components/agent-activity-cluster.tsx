import { ChevronDown } from 'lucide-react-native';
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
import { useTranslation } from 'react-i18next';

import { ActivityMessage } from '@/features/chat/components/activity/ActivityMessage';
import { FileEditGroup } from '@/features/chat/components/activity/FileEditGroup';
import {
  activityDurationMs,
  collectFileEdits,
  formatDuration,
  messageHasOnlyFileActivity,
  summarizeFileEdits,
  traceLines,
} from '@/features/chat/components/activity/tool-helpers';
import { isReasoningOnlyAssistant } from '@/features/chat/activity-timeline';
import { coalesceActivityMessages } from '@/features/chat/activity-message-model';
import type { FileEditDisplayMode, LocalActivityMode } from '@/stores/local-preferences-store';
import type { Palette } from '@/ui/palette';
import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type { UIMessage } from '@/types/api/chat';

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
  activityMode?: LocalActivityMode;
  fileEditDisplayMode?: FileEditDisplayMode;
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
  activityMode = 'auto',
  fileEditDisplayMode = 'summary',
}: AgentActivityClusterProps) {
  const { t } = useTranslation();
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [completionHoldOpen, setCompletionHoldOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wasStreamingRef = useRef(isTurnStreaming);
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
  const hasOnlyFileActivity = fileEdits.length > 0
    && activityMessages.every(messageHasOnlyFileActivity);
  const expanded = manualExpanded ?? (activityMode === 'expanded' || isTurnStreaming || completionHoldOpen);

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

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isTurnStreaming;
    if (isTurnStreaming) {
      const reset = setTimeout(() => setCompletionHoldOpen(false), 0);
      return () => clearTimeout(reset);
    }
    if (!wasStreaming || manualExpanded !== null) return;
    const hold = setTimeout(() => setCompletionHoldOpen(true), 0);
    const collapse = setTimeout(() => setCompletionHoldOpen(false), 900);
    return () => {
      clearTimeout(hold);
      clearTimeout(collapse);
    };
  }, [isTurnStreaming, manualExpanded]);

  if (!hasReasoning && !hasNonReasoningActivity) return null;

  if (hasOnlyFileActivity) {
    return (
      <View style={[styles.container, hasBodyBelow && styles.withBodyBelow]}>
        <FileEditGroup
          colors={colors}
          displayMode={fileEditDisplayMode}
          edits={fileEdits}
          onOpenFilePreview={onOpenFilePreview}
          resolveFilePreviewAvailability={resolveFilePreviewAvailability}
        />
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
  const duration = formatDuration(durationMs);
  const label = hasNonReasoningActivity
    ? isTurnStreaming
      ? t('message.activityWorkingFor', { duration })
      : durationMs > 0
        ? t('message.activityWorkedFor', { duration })
        : t('message.activityWorked')
    : isTurnStreaming
      ? t('message.activityThinkingFor', { duration })
      : durationMs > 0
        ? t('message.activityThoughtFor', { duration })
        : t('message.activityThought');

  return (
    <View style={[styles.container, hasBodyBelow && styles.withBodyBelow]}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggleExpanded}
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
              displayMode={fileEditDisplayMode}
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

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 720 },
  withBodyBelow: { marginBottom: 8 },
  header: {
    minHeight: 28,
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerLabel: { maxWidth: 270, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  timeline: { maxHeight: 180, marginTop: 6 },
  timelineContent: { paddingRight: 3, paddingBottom: 4 },
});
