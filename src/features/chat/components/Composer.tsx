import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';

import type { ComposerProps } from '@/features/chat/composer/model/view-contract';
import { RunGoalStatus } from '@/features/chat/components/widgets/run-goal-status';

import { ComposerContext } from './ComposerContext';
import { ComposerInputRow } from './ComposerInputRow';
import { ComposerSuggestions } from './ComposerSuggestions';
import { composerStyles as styles } from './composer-styles';

/** 全部会话状态使用这一套输入布局；不再维护欢迎页与消息页两份视觉契约。 */
export function Composer({ appearance, inputRef, attachments, draft, runtime, suggestions }: ComposerProps) {
  const { t } = useTranslation();
  const { colors, dark } = appearance;
  const [focused, setFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(44);
  const hasDraft = Boolean(draft.value.trim()) || Boolean(draft.quotedContext?.trim()) || attachments.readyCount > 0;
  const canSend = hasDraft && !runtime.disabled && !attachments.busy && !attachments.items.some((item) => item.status === 'error');
  // 生成中无新草稿时显示停止；有草稿时继续使用原有发送/排队行为。
  const stopButton = runtime.turnActive && !hasDraft;
  return (
    <View accessibilityState={{ busy: runtime.disabled || attachments.busy }}>
      <View style={[styles.composer, { borderColor: focused ? (dark ? colors.userBubble : '#C7E4F9') : colors.border, backgroundColor: colors.card }]}>
        <RunGoalStatus colors={colors} dark={dark} goalState={runtime.goalState} runStartedAt={runtime.runStartedAt} />
        <ComposerSuggestions
          colors={colors}
          mentionCandidates={suggestions.mentionCandidates}
          onMentionCandidateSelect={suggestions.onMentionSelect}
          onSelectSlashCommand={suggestions.onSlashCommandSelect}
          onSkillCandidateSelect={suggestions.onSkillSelect}
          skillCandidates={suggestions.skillCandidates}
          slashCommands={suggestions.slashCommands}
        />
        <ComposerContext
          attachmentError={attachments.error}
          attachments={attachments.items}
          colors={colors}
          onClearQuote={draft.onClearQuote}
          onRemoveAttachment={attachments.onRemove}
          onRemoveQueuedPrompt={runtime.onRemoveQueuedPrompt}
          queuedPrompts={runtime.queuedPrompts}
          quotedContext={draft.quotedContext}
        />
        <ComposerInputRow appearance={appearance} attachments={attachments} canSend={canSend} runtime={runtime} stopButton={stopButton}>
          <TextInput
            ref={inputRef}
            accessibilityLabel={t('thread.composer.inputAria')}
            editable={!runtime.disabled}
            maxLength={65_536}
            multiline
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
            onContentSizeChange={(event) => setInputHeight(Math.max(44, Math.min(140, event.nativeEvent.contentSize.height)))}
            onChangeText={draft.onChangeText}
            onSelectionChange={(event) => draft.onCursorChange(event.nativeEvent.selection.start)}
            placeholder={t(runtime.turnActive ? 'thread.composer.placeholderStreaming' : 'thread.composer.placeholder')}
            placeholderTextColor={colors.subtle}
            selectionColor={dark ? colors.userBubble : '#1473C8'}
            style={[styles.composerInput, { color: colors.foreground, height: draft.value ? inputHeight : 44 }]}
            textAlignVertical="top"
            value={draft.value}
          />
        </ComposerInputRow>
      </View>
    </View>
  );
}
