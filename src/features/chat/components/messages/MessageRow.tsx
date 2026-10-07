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
  const completedAtLabel = assistant && message.completedAt
    ? formatDateTime(message.completedAt)
    : null;
  const showUserCopy = !assistant && hasContent;

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
          <View style={[styles.assistantBubble, { backgroundColor: colors.pressed }]}>
            <MarkdownText
              colors={colors}
              dark={dark}
              onOpenFilePreview={onOpenFilePreview}
              resolveFilePreviewAvailability={resolveFilePreviewAvailability}
              streaming={Boolean(message.isStreaming)}
            >
              {visibleContent}
            </MarkdownText>
          </View>
        ) : (
          <View style={[styles.userBubble, { backgroundColor: colors.userBubble }]}>
            <UserMessageBody
              cliApps={cliApps}
              colors={colors}
              content={visibleContent}
              mcpPresets={mcpPresets}
              message={message}
              slashCommands={slashCommands}
            />
          </View>
        )
      ) : message.isStreaming ? (
        <View style={[styles.streamingDots, { backgroundColor: colors.pressed }]}>
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
      {showAssistantActions || completedAtLabel ? (
        <View style={styles.messageActions}>
          {showAssistantActions ? <MessageCopyButton colors={colors} content={message.content} /> : null}
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
              <Quote color={colors.subtle} size={15} strokeWidth={1.8} />
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
                ? <ActivityIndicator color={colors.subtle} size={15} />
                : <GitFork color={colors.subtle} size={15} strokeWidth={1.8} />}
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
                ? <ActivityIndicator color={colors.subtle} size={15} />
                : <RotateCw color={colors.subtle} size={15} strokeWidth={1.8} />}
            </Pressable>
          ) : null}
          {completedAtLabel ? (
            <Text
              accessibilityLabel={`${t('message.turnLatencyTitle')}: ${formatDateTime(message.completedAt)}`}
              style={[styles.completedAt, { color: colors.subtle }]}
            >
              {completedAtLabel}
            </Text>
          ) : null}
        </View>
      ) : showUserCopy ? (
        <View style={styles.userMessageActions}>
          <MessageCopyButton colors={colors} content={message.content} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', marginVertical: 3 },
  assistantRow: { alignItems: 'flex-start' },
  userRow: { alignItems: 'flex-end' },
  // 沿用原版 openmuse/chat.tsx 的视觉：22px 圆角、用户右下角 7px、最大宽度 85%；正文仍为 16/24。
  userBubble: { maxWidth: '85%', borderRadius: 22, borderBottomRightRadius: 7, paddingHorizontal: 16, paddingVertical: 13 },
  // 沿用原版的助手左下角 7px、最大宽度 95% 和灰卡；在上限内保持稳定宽度，给代码与表格留足空间。
  // Markdown 段落自带 6px 底边距，这里补 7px，普通正文的上下实际留白均为 13px。
  assistantBubble: { width: '100%', maxWidth: '95%', borderRadius: 22, borderBottomLeftRadius: 7, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 7 },
  quotedContext: { width: '100%', marginBottom: 7, borderLeftWidth: 2, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  quotedContextHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  quotedContextLabel: { fontSize: 10, fontWeight: '700' },
  quotedContextText: { fontSize: 12, lineHeight: 17 },
  automationBadge: { alignSelf: 'flex-start', marginBottom: 7, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4 },
  automationBadgeText: { fontSize: 10.5, fontWeight: '600' },
  // 操作始终可见；压缩辅助行高度而非正文，保留原有 7px hitSlop（扩展触摸范围仍受父容器边界限制）。
  messageActions: { minHeight: 30, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  userMessageActions: { minHeight: 30, alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center' },
  completedAt: { marginLeft: 4, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  messageActionButton: { width: 36, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  // 空回复占位也沿用助手卡片的底角，避免等待正文时撑出一整块空白。
  streamingDots: { minHeight: 36, borderRadius: 18, borderBottomLeftRadius: 7, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  streamingDot: { width: 5, height: 5, borderRadius: 3 },
});
