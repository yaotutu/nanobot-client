import { useTranslation } from 'react-i18next';

import { Composer } from '@/features/chat/components/Composer';
import { StreamErrorNotice } from '@/features/chat/components/widgets/stream-error-notice';
import type { ComposerController } from '@/features/chat/hooks/use-composer-controller';
import type {
  ChatModelSelection,
  ChatScreenController,
} from '@/features/chat/model/chat-screen-contract';
import type { Palette } from '@/ui/palette';

interface ChatComposerContainerProps {
  colors: Palette;
  controller: ChatScreenController;
  dark: boolean;
  hasMessages: boolean;
  model: ChatModelSelection;
  onOpenSettings: () => void;
  composer: ComposerController;
}

export function ChatComposerContainer({
  colors,
  composer,
  controller,
  dark,
  hasMessages,
  model,
  onOpenSettings,
}: ChatComposerContainerProps) {
  const { t } = useTranslation();

  return (
    <>
      {controller.errors.stream ? (
        <StreamErrorNotice
          colors={colors}
          error={controller.errors.stream}
          onDismiss={controller.errors.dismissStream}
        />
      ) : null}
      <Composer
        inputRef={composer.inputRef}
        appearance={{
          colors,
          dark,
          variant: hasMessages || controller.thread.loading ? 'thread' : 'hero',
        }}
        attachments={{
          items: composer.attachments.attachments,
          busy: composer.attachments.encoding,
          error: composer.attachments.error,
          full: composer.attachments.full,
          readyCount: composer.attachments.readyAttachments.length,
          onAdd: composer.openAttachmentMenu,
          onRemove: composer.attachments.remove,
        }}
        draft={{
          quotedContext: composer.quotedContext,
          value: composer.text,
          onChangeText: composer.onChangeText,
          onClearQuote: () => composer.setQuotedContext(null),
          onCursorChange: composer.onCursorChange,
        }}
        model={{
          activePreset: model.activeModelPreset,
          displayName: model.modelDisplayLabel,
          presets: model.orderedModelPresets,
          onChange: model.changeModelPreset,
          onOpenSettings,
        }}
        runtime={{
          disabled: composer.sending,
          goalState: controller.runtime.goalState,
          queuedPrompts: composer.queuedPrompts,
          runStartedAt: controller.runtime.runStartedAt,
          turnActive: controller.runtime.turnActive,
          onRemoveQueuedPrompt: composer.removeQueuedPrompt,
          onSend: composer.submit,
          onStop: composer.handleStop,
        }}
        suggestions={{
          mentionCandidates: composer.visibleMentionCandidates,
          skillCandidates: composer.visibleSkillCandidates,
          slashCommands: composer.visibleSlashCommands,
          onMentionSelect: composer.selectMentionCandidate,
          onSkillSelect: composer.selectSkillCandidate,
          onSlashCommandSelect: composer.selectSlashCommand,
        }}
        voice={{
          error: composer.voiceError
            ? t(`thread.composer.voiceErrors.${composer.voiceError}`)
            : null,
          recorder: composer.voiceRecorder,
        }}
        workspace={{
          controls: controller.workspace.catalog?.controls ?? null,
          defaultScope: controller.workspace.catalog?.default_scope ?? null,
          disabled: controller.runtime.turnActive,
          error: controller.workspace.error,
          scope: controller.workspace.activeScope,
          onChange: controller.workspace.updateScope,
        }}
      />
    </>
  );
}
