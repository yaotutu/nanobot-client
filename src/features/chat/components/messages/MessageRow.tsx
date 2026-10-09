import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import GitFork from 'lucide-react-native/icons/git-fork';
import Quote from 'lucide-react-native/icons/quote';
import RotateCw from 'lucide-react-native/icons/rotate-cw';
import Ellipsis from 'lucide-react-native/icons/ellipsis';

import { parseQuotedUserMessage } from '@/services/text/user-quote-format';
import { formatDateTime } from '@/services/text/format';
import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type { SlashCommand } from '@/types/api/chat/commands';
import type { UIMessage } from '@/types/api/chat/messages';
import type { Palette } from '@/ui/palette';

import { MarkdownText } from '@/features/chat/components/widgets/markdown-text';
import { MessageMediaGallery } from '@/features/chat/components/widgets/message-media-gallery';

import { MessageCopyButton } from './MessageRow.extras';
import { UserMessageBody } from './UserMessageBody';

interface MessageRowProps {
  message: UIMessage;
  colors: Palette;
  dark: boolean;
  cliApps: CliAppInfo[];
  mcpPresets: McpPresetInfo[];
  slashCommands: SlashCommand[];
  forkIndex?: number;
  forkBusy: boolean;
  canRetry: boolean;
  isRetryBusy: boolean;
  onFork: (beforeUserIndex: number) => void;
  onRetry: () => void | Promise<void>;
  onOpenFilePreview?: (path: string) => void;
  onQuote: (content: string) => void;
  resolveFilePreviewAvailability?: (path: string) => Promise<boolean>;
}

export function MessageRow({
  message,
  colors,
  dark,
  cliApps,
  mcpPresets,
  slashCommands,
  forkIndex,
  forkBusy,
  canRetry,
  isRetryBusy,
  onFork,
  onRetry,
  onOpenFilePreview,
  onQuote,
  resolveFilePreviewAvailability,
}: MessageRowProps) {
  const { t } = useTranslation();
  // 展开状态只属于当前消息；列表复用行时不会把上一条消息的操作带到下一条。
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  const assistant = message.role === 'assistant';
  const parsedUser = assistant ? null : parseQuotedUserMessage(message.content);
  const visibleContent = parsedUser?.content ?? message.content;
  const hasContent = visibleContent.trim().length > 0;
  const hasMedia = Boolean(message.images?.length || message.media?.length);
  const automationKind = message.source?.kind;
  const automationSource = assistant && (
    automationKind === 'cron'
    || automationKind === 'local_trigger'
    || automationKind === 'trigger'
  )
    ? message.source?.label?.trim() || t('message.automationSourceFallback')
    : null;
  const showAssistantActions = assistant && (hasContent || hasMedia) && !message.isStreaming;
  const completedAtLabel = assistant && !message.isStreaming && message.completedAt
    ? formatDateTime(message.completedAt)
    : null;
  const showUserCopy = !assistant && hasContent;
  const canShowActions = showAssistantActions || showUserCopy;
  const actionsExpanded = canShowActions && expandedMessageId === message.id;
  const toggleActions = () => setExpandedMessageId(actionsExpanded ? null : message.id);

  return (
    <View style={[styles.row, assistant ? styles.assistantRow : styles.userRow]}>
      {parsedUser?.quotedContext ? (
        <View
          style={[
            styles.quotedContext,
            { borderLeftColor: colors.subtle, backgroundColor: colors.card },
          ]}
        >
          <View style={styles.quotedContextHeader}>
            <Quote color={colors.subtle} size={12} strokeWidth={1.8} />
            <Text style={[styles.quotedContextLabel, { color: colors.subtle }]}>
              {t('thread.composer.quotedContext')}
            </Text>
          </View>
          <Text
            numberOfLines={6}
            selectable
            style={[styles.quotedContextText, { color: colors.muted }]}
          >
            {parsedUser.quotedContext}
          </Text>
        </View>
      ) : null}
      {automationSource ? (
        <View
          style={[
            styles.automationBadge,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <Text style={[styles.automationBadgeText, { color: colors.muted }]}>
            {t('message.automationTriggered')} · {automationSource}
          </Text>
        </View>
      ) : null}
      {hasContent ? (
        assistant ? (
          <Pressable
            accessible={false}
            testID={`message-bubble-${message.id}`}
            onLongPress={showAssistantActions ? toggleActions : undefined}
            style={[styles.assistantBubble, { backgroundColor: colors.card }]}
          >
            <MarkdownText
              colors={colors}
              dark={dark}
              onOpenFilePreview={onOpenFilePreview}
              resolveFilePreviewAvailability={resolveFilePreviewAvailability}
              streaming={Boolean(message.isStreaming)}
            >
              {visibleContent}
            </MarkdownText>
          </Pressable>
        ) : (
          <Pressable
            accessible={false}
            testID={`message-bubble-${message.id}`}
            onLongPress={toggleActions}
            style={[styles.userBubble, { backgroundColor: colors.userBubble }]}
          >
            <UserMessageBody
              cliApps={cliApps}
              colors={colors}
              content={visibleContent}
              mcpPresets={mcpPresets}
              message={message}
              slashCommands={slashCommands}
            />
          </Pressable>
        )
      ) : message.isStreaming ? (
        <View style={[styles.streamingDots, { backgroundColor: colors.card }]}>
          <View style={[styles.streamingDot, { backgroundColor: colors.subtle }]} />
          <View style={[styles.streamingDot, { backgroundColor: colors.subtle }]} />
          <View style={[styles.streamingDot, { backgroundColor: colors.subtle }]} />
        </View>
      ) : null}
      {assistant && hasMedia ? (
        <MessageMediaGallery
          align="left"
          colors={colors}
          images={message.images}
          media={message.media}
        />
      ) : null}
      {canShowActions || completedAtLabel ? (
        <View style={[styles.messageMeta, !assistant && styles.userMessageMeta]}>
          {completedAtLabel ? (
            <Text
              accessibilityLabel={`${t('message.turnLatencyTitle')}: ${formatDateTime(message.completedAt)}`}
              style={[styles.completedAt, { color: colors.subtle }]}
            >
              {completedAtLabel}
            </Text>
          ) : null}
          {/* 常态只留一个更多入口；长按正文也能展开，文件链接和文本选择继续由正文处理。 */}
          {canShowActions ? (
            <Pressable
              accessibilityLabel={t('message.actions')}
              accessibilityRole="button"
              accessibilityState={{ expanded: actionsExpanded }}
              hitSlop={8}
              onPress={toggleActions}
              style={({ pressed }) => [styles.moreButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <Ellipsis color={colors.subtle} size={16} strokeWidth={1.7} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {actionsExpanded ? (
        <View style={[styles.messageActions, !assistant && styles.userMessageMeta, { backgroundColor: colors.card }]}>
          {(showUserCopy || showAssistantActions) ? (
            <MessageCopyButton colors={colors} content={message.content} />
          ) : null}
          {showAssistantActions ? (
            <Pressable
              accessibilityLabel={t('message.askAboutSelection')}
              hitSlop={7}
              onPress={() => onQuote(visibleContent)}
              style={({ pressed }) => [
                styles.messageActionButton,
                pressed && { backgroundColor: colors.pressed },
              ]}
            >
              <Quote color={colors.subtle} size={13} strokeWidth={1.7} />
            </Pressable>
          ) : null}
          {showAssistantActions && forkIndex !== undefined ? (
            <Pressable
              accessibilityLabel={t('message.forkFromHere')}
              disabled={forkBusy}
              hitSlop={7}
              onPress={() => onFork(forkIndex)}
              style={({ pressed }) => [
                styles.messageActionButton,
                pressed && { backgroundColor: colors.pressed },
              ]}
            >
              {forkBusy
                ? <ActivityIndicator color={colors.subtle} size={13} />
                : <GitFork color={colors.subtle} size={13} strokeWidth={1.7} />}
            </Pressable>
          ) : null}
          {showAssistantActions && canRetry ? (
            <Pressable
              accessibilityLabel={t('message.retry', { defaultValue: 'Retry' })}
              disabled={isRetryBusy}
              hitSlop={7}
              onPress={() => void onRetry()}
              style={({ pressed }) => [
                styles.messageActionButton,
                pressed && { backgroundColor: colors.pressed },
              ]}
            >
              {isRetryBusy
                ? <ActivityIndicator color={colors.subtle} size={13} />
                : <RotateCw color={colors.subtle} size={13} strokeWidth={1.7} />}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 列表间距由 ChatThread 的 rowGap 统一控制，避免每条消息再叠加外边距。
  row: { width: '100%' },
  assistantRow: { alignItems: 'flex-start' },
  userRow: { alignItems: 'flex-end' },
  // 长回复优先利用宽度，短文本仍自然收缩；用户气泡略窄以保留对话方向。
  userBubble: { maxWidth: '88%', borderRadius: 24, borderBottomRightRadius: 8, paddingHorizontal: 15, paddingVertical: 12 },
  // Markdown 自带 6px 段落底边距；底部只补 6px，保持实际上下留白一致。
  assistantBubble: { maxWidth: '100%', borderRadius: 24, borderBottomLeftRadius: 8, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 6 },
  quotedContext: { width: '100%', marginBottom: 7, borderLeftWidth: 2, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  quotedContextHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  quotedContextLabel: { fontSize: 10, fontWeight: '700' },
  quotedContextText: { fontSize: 12, lineHeight: 17 },
  automationBadge: { alignSelf: 'flex-start', marginBottom: 7, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4 },
  automationBadgeText: { fontSize: 10.5, fontWeight: '600' },
  messageMeta: { minHeight: 22, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  userMessageMeta: { alignSelf: 'flex-end' },
  // 低频工具条按需挂载，默认不显示复制／引用／分支／重试四个图标。
  messageActions: { alignSelf: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 3, padding: 4, borderRadius: 12 },
  moreButton: { width: 28, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  completedAt: { fontSize: 10, fontVariant: ['tabular-nums'] },
  messageActionButton: { width: 30, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  // 空回复占位也沿用助手卡片的底角，避免等待正文时撑出一整块空白。
  streamingDots: { minHeight: 36, borderRadius: 18, borderBottomLeftRadius: 8, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 6 },
  streamingDot: { width: 5, height: 5, borderRadius: 3 },
});
