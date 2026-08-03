import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';

import type { CapabilityMentionCandidate } from '@/features/chat/capability-mentions';
import type { SkillMentionCandidate } from '@/features/chat/skill-mentions';
import { RunGoalStatus } from '@/features/chat/components/widgets/run-goal-status';
import { WorkspaceProjectPicker } from '@/features/workspaces/components/WorkspaceControls';
import type { VoiceRecorderController } from '@/features/chat/hooks/use-voice-recorder';
import type { ComposerAttachment } from '@/types/api/chat';
import type { GoalStateWsPayload } from '@/types/api/runtime';
import type { SettingsPayload } from '@/types/api/settings';
import type { WorkspaceScopePayload, WorkspacesPayload } from '@/types/api/workspaces';
import type { Palette } from '@/ui/palette';
import { ComposerContext } from './ComposerContext';
import { ComposerSuggestions } from './ComposerSuggestions';
import { ComposerToolbar } from './ComposerToolbar';
import type { ComposerSlashCommand, QueuedPrompt } from '@/features/chat/hooks/use-composer-controller';
import { composerStyles as styles } from './composer-styles';

interface ComposerProps {
  activeModelPreset: string;
  colors: Palette;
  dark: boolean;
  value: string;
  goalState?: GoalStateWsPayload;
  inputRef: RefObject<TextInput | null>;
  modelName: string;
  mentionCandidates: CapabilityMentionCandidate[];
  skillCandidates: SkillMentionCandidate[];
  modelPresets: SettingsPayload['model_presets'];
  quotedContext: string | null;
  variant: 'hero' | 'thread';
  turnActive: boolean;
  disabled: boolean;
  workspaceScope: WorkspaceScopePayload | null;
  workspaceDefaultScope: WorkspaceScopePayload | null;
  workspaceControls: WorkspacesPayload['controls'] | null;
  workspaceError: string | null;
  workspaceScopeDisabled: boolean;
  attachments: ComposerAttachment[];
  attachmentBusy: boolean;
  attachmentFull: boolean;
  attachmentError: string | null;
  readyAttachmentCount: number;
  queuedPrompts: QueuedPrompt[];
  runStartedAt: number | null;
  slashCommands: ComposerSlashCommand[];
  voiceError: string | null;
  voiceRecorder: VoiceRecorderController;
  onAddAttachment: () => void;
  onClearQuote: () => void;
  onCursorChange: (cursor: number) => void;
  onMentionCandidateSelect: (candidate: CapabilityMentionCandidate) => void;
  onSkillCandidateSelect: (candidate: SkillMentionCandidate) => void;
  onModelPresetChange: (name: string) => Promise<void>;
  onOpenModelSettings: () => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveQueuedPrompt: (id: string) => void;
  onChangeText: (value: string) => void;
  onSelectSlashCommand: (command: ComposerSlashCommand) => void;
  onWorkspaceScopeChange: (scope: WorkspaceScopePayload) => void;
  onSend: () => void;
  onStop: () => void;
}

export function Composer({
  activeModelPreset,
  colors,
  dark,
  value,
  goalState,
  inputRef,
  modelName,
  mentionCandidates,
  skillCandidates,
  modelPresets,
  quotedContext,
  variant,
  turnActive,
  disabled,
  workspaceScope,
  workspaceDefaultScope,
  workspaceControls,
  workspaceError,
  workspaceScopeDisabled,
  attachments,
  attachmentBusy,
  attachmentFull,
  attachmentError,
  readyAttachmentCount,
  queuedPrompts,
  runStartedAt,
  slashCommands,
  voiceError,
  voiceRecorder,
  onAddAttachment,
  onClearQuote,
  onCursorChange,
  onMentionCandidateSelect,
  onSkillCandidateSelect,
  onModelPresetChange,
  onOpenModelSettings,
  onRemoveAttachment,
  onRemoveQueuedPrompt,
  onChangeText,
  onSelectSlashCommand,
  onWorkspaceScopeChange,
  onSend,
  onStop,
}: ComposerProps) {
  const { t } = useTranslation();
  const hasDraft = Boolean(value.trim()) || Boolean(quotedContext?.trim()) || readyAttachmentCount > 0;
  const canSend = hasDraft && !disabled && !attachmentBusy && !attachments.some((item) => item.status === 'error');
  const stopButton = turnActive && !hasDraft;
  const voiceBusy = voiceRecorder.phase !== 'idle';

  return (
    <View
      accessibilityState={{ busy: disabled || attachmentBusy }}
      style={[
        styles.composer,
        variant === 'hero' ? styles.composerHero : styles.composerThread,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <RunGoalStatus colors={colors} dark={dark} goalState={goalState} runStartedAt={runStartedAt} />
      <ComposerSuggestions
        colors={colors}
        mentionCandidates={mentionCandidates}
        onMentionCandidateSelect={onMentionCandidateSelect}
        onSelectSlashCommand={onSelectSlashCommand}
        onSkillCandidateSelect={onSkillCandidateSelect}
        skillCandidates={skillCandidates}
        slashCommands={slashCommands}
      />
      <ComposerContext
        attachmentError={attachmentError}
        attachments={attachments}
        colors={colors}
        onClearQuote={onClearQuote}
        onRemoveAttachment={onRemoveAttachment}
        onRemoveQueuedPrompt={onRemoveQueuedPrompt}
        queuedPrompts={queuedPrompts}
        quotedContext={quotedContext}
        voiceError={voiceError}
      />
      <TextInput
        ref={inputRef}
        accessibilityLabel={t('thread.composer.inputAria')}
        editable={!disabled && !voiceBusy}
        maxLength={65_536}
        multiline
        onChangeText={onChangeText}
        onSelectionChange={(event) => onCursorChange(event.nativeEvent.selection.start)}
        placeholder={turnActive ? t('thread.composer.placeholderStreaming') : variant === 'hero' ? t('thread.composer.placeholderHero') : t('thread.composer.placeholderThread')}
        placeholderTextColor={colors.subtle}
        style={[styles.composerInput, variant === 'hero' && styles.composerInputHero, { color: colors.foreground }]}
        textAlignVertical="top"
        value={value}
      />
      <ComposerToolbar
        activeModelPreset={activeModelPreset}
        attachmentBusy={attachmentBusy}
        attachmentFull={attachmentFull}
        canSend={canSend}
        colors={colors}
        disabled={disabled}
        modelName={modelName}
        modelPresets={modelPresets}
        onAddAttachment={onAddAttachment}
        onModelPresetChange={onModelPresetChange}
        onOpenModelSettings={onOpenModelSettings}
        onSend={onSend}
        onStop={onStop}
        onWorkspaceScopeChange={onWorkspaceScopeChange}
        stopButton={stopButton}
        turnActive={turnActive}
        variant={variant}
        voiceRecorder={voiceRecorder}
        workspaceControls={workspaceControls}
        workspaceScope={workspaceScope}
        workspaceScopeDisabled={workspaceScopeDisabled}
      />
      <WorkspaceProjectPicker
        colors={colors}
        controls={workspaceControls}
        defaultScope={workspaceDefaultScope}
        disabled={disabled || workspaceScopeDisabled}
        error={workspaceError}
        isHero={variant === 'hero'}
        onChange={onWorkspaceScopeChange}
        scope={workspaceScope}
      />
    </View>
  );
}

export { AttachmentChip } from './ComposerContext';
export { formatAttachmentBytes, queuedPromptPreview } from '@/features/chat/composer-model';
export { MentionCandidateLogo } from './ComposerSuggestions';
