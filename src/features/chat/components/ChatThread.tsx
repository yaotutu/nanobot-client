import ArrowDown from 'lucide-react-native/icons/arrow-down';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AgentActivityCluster } from '@/features/chat/components/activity/AgentActivityCluster';
import { type TurnUnit } from '@/features/chat/activity/model/activity-timeline';
import {
  type ChatDisplayUnit,
  type ChatThreadListRef,
} from '@/features/chat/hooks/useChatScroll';
import { MessageRow as ExtractedMessageRow } from '@/features/chat/components/messages/MessageRow';
import { ForkBoundaryDivider as ExtractedForkBoundaryDivider } from '@/features/chat/components/messages/MessageRow.extras';
import type { Palette } from '@/ui/palette';
import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type { SlashCommand } from '@/types/api/chat/commands';

export interface ChatThreadProps {
  // Inverted FlatList 的滚动回调。offset 0 是视觉底部，也就是最新消息。
  listRef: React.RefObject<ChatThreadListRef>;
  atBottom: boolean;
  scrollToBottom: (animated?: boolean, force?: boolean) => void;
  loadEarlier: () => void;
  handleThreadScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleContentSizeChange: () => void;
  handleScrollToIndexFailed: (info: { averageItemLength: number; index: number }) => void;
  onMomentumScrollEnd: () => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;

  // units/fork/live 数据保持时间正序，展示层统一反向，避免污染业务模型。
  units: TurnUnit[];
  unitKeys: string[];
  forkIndexes: Array<number | undefined>;
  forkBoundaryAfterUnitIndex: number | null;
  liveActivityClusterIndices: Set<number>;

  forkingMessageId: string | null;
  retryingMessageId: string | null;
  colors: Palette;
  dark: boolean;
  cliApps: CliAppInfo[];
  mcpPresets: McpPresetInfo[];
  slashCommands: SlashCommand[];
  hasMoreBefore: boolean;
  loadingOlder: boolean;

  canRetryFromMessage: (unit: TurnUnit, unitIndex: number) => boolean;
  forkFromMessage: (messageId: string, beforeUserIndex: number) => Promise<void>;
  retryFromMessage: (messageId: string) => () => Promise<void>;
  resolveFilePreviewAvailability: (path: string) => Promise<boolean>;
  onOpenFilePreview: ((path: string) => void) | undefined;
  onQuote: (source: string) => void;
}

export function ChatThread({
  listRef,
  atBottom,
  scrollToBottom,
  loadEarlier,
  handleThreadScroll,
  handleContentSizeChange,
  handleScrollToIndexFailed,
  onMomentumScrollEnd,
  onScrollBeginDrag,
  onScrollEndDrag,
  units,
  unitKeys,
  forkIndexes,
  forkBoundaryAfterUnitIndex,
  liveActivityClusterIndices,
  forkingMessageId,
  retryingMessageId,
  colors,
  dark,
  cliApps,
  mcpPresets,
  slashCommands,
  hasMoreBefore,
  loadingOlder,
  canRetryFromMessage,
  forkFromMessage,
  retryFromMessage,
  resolveFilePreviewAvailability,
  onOpenFilePreview,
  onQuote,
}: ChatThreadProps) {
  const { t } = useTranslation();

  // FlatList 使用“新到旧”的数据。反向只发生在展示层，业务时间线和 fork 索引仍为“旧到新”。
  const displayUnits = useMemo<ChatDisplayUnit[]>(() => {
    const chronological = units.map((unit, index) => ({
      key: unitKeys[index] ?? `unit-${index}`,
      unit,
    }));
    return chronological.reverse();
  }, [unitKeys, units]);

  return (
    <View style={styles.threadListArea}>
      <FlatList
        ref={listRef}
        testID="chat-thread-list"
        style={styles.list}
        contentContainerStyle={[
          styles.messagesContent,
          {
            // Inverted 会让原始 top/bottom 视觉互换：视觉底部 20、顶部 15。
            paddingTop: 20,
            paddingBottom: 15,
            backgroundColor: colors.background,
            rowGap: 13,
          },
        ]}
        data={displayUnits}
        keyExtractor={(item, index) => item.key ?? `unit-${index}`}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        inverted
        ListFooterComponent={
          hasMoreBefore ? (
            <Pressable
              accessibilityLabel={t('thread.loadEarlier')}
              accessibilityRole="button"
              disabled={loadingOlder}
              onPress={loadEarlier}
              style={styles.loadOlderButton}
            >
              {loadingOlder ? (
                <ActivityIndicator color={colors.muted} size="small" />
              ) : (
                <Text style={[styles.loadOlderText, { color: colors.muted }]}>
                  {t('thread.loadEarlier')}
                </Text>
              )}
            </Pressable>
          ) : null
        }
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        onContentSizeChange={handleContentSizeChange}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScroll={handleThreadScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        scrollEventThrottle={32}
        renderItem={({ item, index }) => {
          // 展示索引和时间线索引互为镜像；业务状态仍使用时间线索引。
          const chronologicalIndex = units.length - 1 - index;
          const unit = item.unit;
          const next = units[chronologicalIndex + 1];
          // 视觉上位于活动块下方的助手正文，在时间线里是当前 unit 的下一个元素。
          const hasBodyBelow =
            unit.type === 'activity' &&
            next?.type === 'message' &&
            next.message.role === 'assistant';
          return (
            <View>
              {unit.type === 'activity' ? (
                <View style={styles.activityRow}>
                  <AgentActivityCluster
                    colors={colors}
                    cliApps={cliApps}
                    hasBodyBelow={hasBodyBelow}
                    isTurnStreaming={liveActivityClusterIndices.has(chronologicalIndex)}
                    messages={unit.messages}
                    mcpPresets={mcpPresets}
                    onOpenFilePreview={onOpenFilePreview}
                    resolveFilePreviewAvailability={resolveFilePreviewAvailability}
                    startedAtMs={unit.startedAtMs}
                    turnLatencyMs={unit.turnLatencyMs}
                  />
                </View>
              ) : (
                <ExtractedMessageRow
                  colors={colors}
                  dark={dark}
                  forkBusy={forkingMessageId === unit.message.id}
                  forkIndex={forkIndexes[chronologicalIndex]}
                  canRetry={canRetryFromMessage(unit, chronologicalIndex)}
                  isRetryBusy={retryingMessageId === unit.message.id}
                  cliApps={cliApps}
                  mcpPresets={mcpPresets}
                  message={unit.message}
                  slashCommands={slashCommands}
                  onFork={(beforeUserIndex) => void forkFromMessage(unit.message.id, beforeUserIndex)}
                  onRetry={retryFromMessage(unit.message.id)}
                  onOpenFilePreview={onOpenFilePreview}
                  onQuote={onQuote}
                  resolveFilePreviewAvailability={resolveFilePreviewAvailability}
                />
              )}
              {forkBoundaryAfterUnitIndex === chronologicalIndex ? (
                <ExtractedForkBoundaryDivider colors={colors} />
              ) : null}
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
      {!atBottom ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('thread.scrollToBottom')}
          onPress={() => scrollToBottom(true, true)}
          style={({ pressed }) => [
            styles.scrollToBottomButton,
            {
              backgroundColor: colors.pressed,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <ArrowDown color={colors.foreground} size={14} strokeWidth={1.7} />
          <Text style={[styles.latestLabel, { color: colors.foreground }]}>{t('thread.latestMessages')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  threadListArea: { minHeight: 0, flex: 1 },
  list: { flex: 1 },
  messagesContent: { flexGrow: 1, paddingHorizontal: 17 },
  // 单独占据列表与输入框之间的一行，避免浮在消息内容上遮住代码或表格。
  scrollToBottomButton: {
    alignSelf: 'center',
    minHeight: 36,
    marginTop: 2,
    marginBottom: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  latestLabel: { fontSize: 12, fontWeight: '500' },
  loadOlderButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  loadOlderText: { fontSize: 13, fontWeight: '500' },
  activityRow: { width: '100%' },
});
