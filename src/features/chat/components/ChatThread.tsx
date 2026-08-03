import { ArrowDown } from 'lucide-react-native';
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
import type { SlashCommand } from '@/types/api/chat';
import type { LocalPreferences } from '@/stores/local-preferences-store';


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
  preferences: LocalPreferences;

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
  preferences,
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
        contentContainerStyle={[
          styles.messagesContent,
          {
            paddingBottom: 18,
            backgroundColor: colors.background,
            rowGap: preferences.density === 'compact' ? 3 : 10,
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
                    activityMode={preferences.activityMode}
                    colors={colors}
                    cliApps={cliApps}
                    hasBodyBelow={hasBodyBelow}
                    fileEditDisplayMode={preferences.fileEditDisplayMode}
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
                  codeWrap={preferences.codeWrap}
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
          accessibilityLabel={t('thread.scrollToBottom')}
          onPress={() => scrollToBottom(true, true)}
          style={({ pressed }) => [
            styles.scrollToBottomButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <ArrowDown color={colors.muted} size={18} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  threadListArea: { minHeight: 0, flex: 1 },
  messagesContent: { flexGrow: 1, paddingHorizontal: 15, paddingTop: 12 },
  scrollToBottomButton: {
    position: 'absolute',
    right: 16,
    bottom: 10,
    width: 38,
    height: 38,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 9,
    elevation: 5,
  },
  loadOlderButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  loadOlderText: { fontSize: 12, fontWeight: '500' },
  activityRow: { width: '100%', marginVertical: 5, paddingHorizontal: 5 },
});
