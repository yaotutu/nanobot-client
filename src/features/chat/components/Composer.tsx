import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';

import type { ComposerProps } from '@/features/chat/composer/model/view-contract';
import { RunGoalStatus } from '@/features/chat/components/widgets/run-goal-status';
import { WorkspaceProjectPicker } from '@/features/workspaces';

import { ComposerContext } from './ComposerContext';
import { ComposerSuggestions } from './ComposerSuggestions';
import { ComposerToolbar } from './ComposerToolbar';
import { composerStyles as styles } from './composer-styles';

export function Composer({
  appearance,
  inputRef,
  attachments,
  draft,
  model,
  runtime,
  suggestions,
  voice,
  workspace,
}: ComposerProps) {
  const { t } = useTranslation();
  const { colors, dark, variant } = appearance;
  const hasDraft = Boolean(draft.value.trim())
    || Boolean(draft.quotedContext?.trim())
    || attachments.readyCount > 0;
  const canSend = hasDraft
    && !runtime.disabled
    && !attachments.busy
    && !attachments.items.some((item) => item.status === 'error');
  const stopButton = runtime.turnActive && !hasDraft;
  const voiceBusy = voice.recorder.phase !== 'idle';

  return (
    <View
      accessibilityState={{ busy: runtime.disabled || attachments.busy }}
      style={[
        styles.composer,
        variant === 'hero' ? styles.composerHero : styles.composerThread,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <RunGoalStatus
        colors={colors}
        dark={dark}
        goalState={runtime.goalState}
        runStartedAt={runtime.runStartedAt}
      />
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
        voiceError={voice.error}
      />
      <TextInput
        ref={inputRef}
        accessibilityLabel={t('thread.composer.inputAria')}
        editable={!runtime.disabled && !voiceBusy}
        maxLength={65_536}
        multiline
        onChangeText={draft.onChangeText}
        onSelectionChange={(event) => draft.onCursorChange(event.nativeEvent.selection.start)}
        placeholder={
          runtime.turnActive
            ? t('thread.composer.placeholderStreaming')
            : variant === 'hero'
              ? t('thread.composer.placeholderHero')
              : t('thread.composer.placeholderThread')
        }
        placeholderTextColor={colors.subtle}
        style={[
          styles.composerInput,
          variant === 'hero' && styles.composerInputHero,
          { color: colors.foreground },
        ]}
        textAlignVertical="top"
        value={draft.value}
      />
      <ComposerToolbar
        appearance={appearance}
        attachments={attachments}
        canSend={canSend}
        model={model}
        runtime={runtime}
        stopButton={stopButton}
        voice={voice}
        workspace={workspace}
      />
      <WorkspaceProjectPicker
        colors={colors}
        controls={workspace.controls}
        defaultScope={workspace.defaultScope}
        disabled={runtime.disabled || workspace.disabled}
        error={workspace.error}
        isHero={variant === 'hero'}
        onChange={workspace.onChange}
        scope={workspace.scope}
      />
    </View>
  );
}

export { AttachmentChip } from './ComposerContext';
export { formatAttachmentBytes, queuedPromptPreview } from '@/features/chat/composer/model/presentation';
export { MentionCandidateLogo } from './ComposerSuggestions';
