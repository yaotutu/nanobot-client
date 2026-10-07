import ArrowDown from 'lucide-react-native/icons/arrow-down';
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
import { useTranslation } from 'react-i18next';

import { AgentActivityCluster } from '@/features/chat/components/activity/AgentActivityCluster';
import { type TurnUnit } from '@/features/chat/activity/model/activity-timeline';
import { MessageRow as ExtractedMessageRow } from '@/features/chat/components/messages/MessageRow';
import { ForkBoundaryDivider as ExtractedForkBoundaryDivider } from '@/features/chat/components/messages/MessageRow.extras';
import type { Palette } from '@/ui/palette';
import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type { SlashCommand } from '@/types/api/chat/commands';


export interface ChatThreadProps {
  // scroll
  listRef: React.RefObject<FlatList<TurnUnit> | null>;
  atBottom: boolean;
  scrollToBottom: (animated?: boolean, force?: boolean) => void;
  loadEarlier: () => void;
  handleThreadScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleContentSizeChange: () => void;
  handleScrollToIndexFailed: (info: { averageItemLength: number; index: number }) => void;
  onMomentumScrollEnd: () => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;

  // data
  units: TurnUnit[];
  unitKeys: string[];
  forkIndexes: Array<number | undefined>;
  forkBoundaryAfterUnitIndex: number | null;
  liveActivityClusterIndices: Set<number>;

  // per-message state
  forkingMessageId: string | null;
  retryingMessageId: string | null;

  // theme
  colors: Palette;
  dark: boolean;

  // capabilities
  cliApps: CliAppInfo[];
  mcpPresets: McpPresetInfo[];
  slashCommands: SlashCommand[];

  // session
  hasMoreBefore: boolean;
  loadingOlder: boolean;

  // callbacks
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

  return (
    <View style={styles.threadListArea}>
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={[
          styles.messagesContent,
          {
            paddingBottom: 12,
            backgroundColor: colors.background,
            rowGap: 12,
          },
        ]}
        data={units}
        keyExtractor={(_item, index) => unitKeys[index] ?? `unit-${index}`}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          hasMoreBefore ? (
            <Pressable
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
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onContentSizeChange={handleContentSizeChange}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScroll={handleThreadScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        scrollEventThrottle={32}
        renderItem={({ item, index }) => {
          const next = units[index + 1];
          const hasBodyBelow =
            item.type === 'activity' &&
            next?.type === 'message' &&
            next.message.role === 'assistant';
          return (
            <View>
              {item.type === 'activity' ? (
                <View style={styles.activityRow}>
                  <AgentActivityCluster
                    colors={colors}
                    cliApps={cliApps}
                    hasBodyBelow={hasBodyBelow}
                    isTurnStreaming={liveActivityClusterIndices.has(index)}
                    messages={item.messages}
                    mcpPresets={mcpPresets}
                    onOpenFilePreview={onOpenFilePreview}
                    resolveFilePreviewAvailability={resolveFilePreviewAvailability}
                    startedAtMs={item.startedAtMs}
                    turnLatencyMs={item.turnLatencyMs}
                  />
                </View>
              ) : (
                <ExtractedMessageRow
                  colors={colors}
                  dark={dark}
                  forkBusy={forkingMessageId === item.message.id}
                  forkIndex={forkIndexes[index]}
                  canRetry={canRetryFromMessage(item, index)}
                  isRetryBusy={retryingMessageId === item.message.id}
                  cliApps={cliApps}
                  mcpPresets={mcpPresets}
                  message={item.message}
                  slashCommands={slashCommands}
                  onFork={(beforeUserIndex) => void forkFromMessage(item.message.id, beforeUserIndex)}
                  onRetry={retryFromMessage(item.message.id)}
                  onOpenFilePreview={onOpenFilePreview}
                  onQuote={onQuote}
                  resolveFilePreviewAvailability={resolveFilePreviewAvailability}
                />
              )}
              {forkBoundaryAfterUnitIndex === index ? (
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
  messagesContent: { flexGrow: 1, paddingHorizontal: 17, paddingTop: 8 },
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
