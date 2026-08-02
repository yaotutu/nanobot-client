import { Image as ExpoImage } from 'expo-image';
import { FileText, Quote, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { formatAttachmentBytes, queuedPromptPreview } from '@/features/chat/composer-model';
import type { ComposerAttachment } from '@/types/api/chat';
import type { Palette } from '@/ui/palette';
import type { QueuedPrompt } from '@/features/chat/hooks/use-composer-controller';
import { composerStyles as styles } from './composer-styles';

export function ComposerContext(props: {
  colors: Palette;
  queuedPrompts: QueuedPrompt[];
  quotedContext: string | null;
  attachments: ComposerAttachment[];
  attachmentError: string | null;
  voiceError: string | null;
  onClearQuote: () => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveQueuedPrompt: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { colors, queuedPrompts, quotedContext, attachments, attachmentError, voiceError } = props;
  return (
    <>
      {queuedPrompts.length ? (
        <View style={[styles.queuedPromptList, { borderBottomColor: colors.border }]}> 
          <Text style={[styles.queuedPromptLabel, { color: colors.subtle }]}>{t('thread.composer.queued.label')}</Text>
          {queuedPrompts.map((prompt) => (
            <View key={prompt.id} style={[styles.queuedPromptRow, { backgroundColor: colors.pressed }]}> 
              <Text numberOfLines={1} style={[styles.queuedPromptText, { color: colors.muted }]}>{queuedPromptPreview(prompt, t)}</Text>
              {prompt.attachments.length ? <Text style={[styles.queuedPromptCount, { color: colors.subtle }]}>+{prompt.attachments.length}</Text> : null}
              <Pressable accessibilityLabel={t('thread.composer.queued.delete')} hitSlop={7} onPress={() => props.onRemoveQueuedPrompt(prompt.id)} style={styles.queuedPromptRemove}>
                <X color={colors.subtle} size={13} strokeWidth={2} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {quotedContext ? (
        <View style={[styles.composerQuote, { borderBottomColor: colors.border, backgroundColor: colors.pressed }]}> 
          <Quote color={colors.subtle} size={14} strokeWidth={1.8} />
          <View style={styles.composerQuoteBody}>
            <Text style={[styles.composerQuoteLabel, { color: colors.subtle }]}>{t('thread.composer.quotedContext')}</Text>
            <Text numberOfLines={3} style={[styles.composerQuoteText, { color: colors.muted }]}>{quotedContext}</Text>
          </View>
          <Pressable accessibilityLabel={t('thread.composer.removeQuotedContext')} hitSlop={7} onPress={props.onClearQuote} style={styles.composerQuoteClose}>
            <X color={colors.subtle} size={15} strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}
      {attachments.length ? (
        <ScrollView contentContainerStyle={styles.attachmentList} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
          {attachments.map((attachment) => (
            <AttachmentChip attachment={attachment} colors={colors} key={attachment.id} onRemove={() => props.onRemoveAttachment(attachment.id)} />
          ))}
        </ScrollView>
      ) : null}
      {attachmentError ? <Text accessibilityRole="alert" style={[styles.attachmentError, { color: colors.errorText }]}>{attachmentError}</Text> : null}
      {voiceError ? <Text accessibilityRole="alert" selectable style={[styles.voiceError, { color: colors.errorText }]}>{voiceError}</Text> : null}
    </>
  );
}

export function AttachmentChip({ attachment, colors, onRemove }: { attachment: ComposerAttachment; colors: Palette; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.attachmentChip, { borderColor: colors.border, backgroundColor: colors.pressed }]}> 
      {attachment.kind === 'image' ? (
        <ExpoImage contentFit="cover" source={{ uri: attachment.uri }} style={styles.attachmentThumb} />
      ) : (
        <View style={[styles.attachmentFileIcon, { backgroundColor: colors.card }]}><FileText color={colors.muted} size={18} strokeWidth={1.7} /></View>
      )}
      <View style={styles.attachmentLabelArea}>
        <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.foreground }]}>{attachment.name}</Text>
        <Text numberOfLines={1} style={[styles.attachmentStatus, { color: attachment.status === 'error' ? colors.errorText : colors.muted }]}> 
          {attachment.status === 'encoding'
            ? t('thread.composer.encoding')
            : attachment.status === 'error'
              ? attachment.error || t('thread.composer.imageRejected.io')
              : formatAttachmentBytes(attachment.encodedBytes ?? attachment.size)}
        </Text>
      </View>
      {attachment.status === 'encoding' ? <ActivityIndicator color={colors.muted} size="small" /> : null}
      <Pressable accessibilityLabel={`${t('thread.composer.remove')}: ${attachment.name}`} hitSlop={7} onPress={onRemove}>
        <X color={colors.muted} size={14} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
