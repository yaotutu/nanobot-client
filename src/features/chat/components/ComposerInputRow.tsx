import Plus from 'lucide-react-native/icons/plus';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Square from 'lucide-react-native/icons/square';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { ComposerAppearance, ComposerAttachments, ComposerRuntimeState } from '@/features/chat/composer/model/view-contract';
import { composerStyles as styles } from './composer-styles';

interface ComposerInputRowProps {
  children: ReactNode;
  appearance: ComposerAppearance;
  attachments: ComposerAttachments;
  canSend: boolean;
  runtime: ComposerRuntimeState;
  stopButton: boolean;
}

/** 主输入行只负责附件、文本和发送；模型与工作区控件不挤占输入空间。 */
export function ComposerInputRow({ children, appearance, attachments, canSend, runtime, stopButton }: ComposerInputRowProps) {
  const { t } = useTranslation();
  const { colors } = appearance;
  const attachmentsDisabled = runtime.disabled || attachments.full || attachments.busy;
  return (
    <View style={styles.inputRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('thread.composer.attachImage')}
        accessibilityState={{ disabled: attachmentsDisabled }}
        disabled={attachmentsDisabled}
        onPress={attachments.onAdd}
        style={({ pressed }) => [styles.roundIconButton, pressed && { backgroundColor: colors.pressed }, attachmentsDisabled && styles.sendButtonDisabled]}
      >
        <Plus color={colors.muted} size={22} strokeWidth={1.8} />
      </Pressable>
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(stopButton ? 'thread.composer.stop' : 'thread.composer.send')}
        accessibilityState={{ busy: runtime.disabled || attachments.busy, disabled: !stopButton && !canSend }}
        disabled={!stopButton && !canSend}
        onPress={stopButton ? runtime.onStop : runtime.onSend}
        style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.userBubble }, pressed && { opacity: 0.72 }, !stopButton && !canSend && styles.sendButtonDisabled]}
      >
        {stopButton
          ? <Square color={colors.userText} fill={colors.userText} size={14} />
          : runtime.disabled || attachments.busy
            ? <ActivityIndicator color={colors.userText} size="small" />
            : <ArrowUp color={colors.userText} size={22} strokeWidth={2} />}
      </Pressable>
    </View>
  );
}
