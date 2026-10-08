import { StyleSheet, Text } from 'react-native';

import { Composer } from '@/features/chat/components/Composer';
import { ChatOptionsModal } from '@/features/chat/components/modals/ChatOptionsModal';
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
  model: ChatModelSelection;
  composer: ComposerController;
  optionsOpen: boolean;
  hasUserPrompts: boolean;
  onOpenPromptNavigator: () => void;
  onCloseOptions: () => void;
}

export function ChatComposerContainer({
  colors,
  composer,
  controller,
  dark,
  model,
  optionsOpen,
  hasUserPrompts,
  onOpenPromptNavigator,
  onCloseOptions,
}: ChatComposerContainerProps) {
  // 所有配置沿用原来的连接／发送禁用规则；权限和工作区另外禁止在回合执行中修改。
  const disabled = composer.sending
    || controller.runtime.connectionSyncing
    || !controller.runtime.networkAvailable
    || controller.runtime.connectionStatus !== 'open';
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
        runtime={{
          disabled,
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
      />
      {controller.workspace.error ? (
        <Text accessibilityRole="alert" style={[styles.workspaceError, { color: colors.errorText }]}>
          {controller.workspace.error}
        </Text>
      ) : null}
      {/* 弹窗独立挂载，开关配置不会卸载输入区，也不会丢失草稿或附件。 */}
      {optionsOpen ? (
        <ChatOptionsModal
          canChangeProject={!controller.session.activeKey}
          colors={colors}
          disabled={disabled}
          model={model}
          onClose={onCloseOptions}
          turnActive={controller.runtime.turnActive}
          hasUserPrompts={hasUserPrompts}
          onOpenPromptNavigator={onOpenPromptNavigator}
          workspace={controller.workspace}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  workspaceError: { marginTop: 8, paddingHorizontal: 12, fontSize: 12, lineHeight: 18 },
});
