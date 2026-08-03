import { X } from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { AppController } from '@/features/app/hooks/use-app-controller';
import type { AppModelSelection } from '@/features/app/hooks/use-app-model-selection';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import type { Palette } from '@/ui/palette';

import {
  normalizeActivityTimeline,
  type TurnUnit,
} from '@/features/chat/activity-timeline';
import {
  assistantForkIndexes,
  currentActivityClusterIndices,
  unitIndexAfterMessageCount,
  unitKeysForDisplay,
} from '@/features/chat/components/timeline';
import { useChatScroll } from '@/features/chat/hooks/useChatScroll';
import { sessionTitle } from '@/services/text/format';
import { Composer as ExtractedComposer } from '@/features/chat/components/Composer';
import { ChatHeader } from '@/features/chat/components/ChatHeader';
import { ChatModals } from '@/features/chat/components/ChatModals';
import { StreamErrorNotice } from '@/features/chat/components/widgets/stream-error-notice';
import { ChatSurface } from '@/features/chat/components/ChatSurface';
import { useComposerController } from '@/features/chat/hooks/use-composer-controller';
import { useFilePreviewAvailability } from '@/features/chat/hooks/use-file-preview-availability';
import { useChatLocalState } from '@/features/chat/hooks/use-chat-local-state';

interface NanobotScreenProps {
  app: AppController;
  colors: Palette;
  dark: boolean;
  preferences: LocalPreferences;
  model: AppModelSelection;
  utilityView: string;
  utilityContent: ReactNode;
  navigationRevision: number;
  onChangePreferences: (next: LocalPreferences) => void;
  onOpenDrawer: () => void;
  onOpenSettings: () => void;
}

export function NanobotScreen({ app: props, ...shell }: NanobotScreenProps) {
  const { hasMoreBefore, loadingOlder, loadOlder } = props;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const {
    assistantQuoteSource,
    promptNavigatorOpen,
    sessionInfoOpen,
    filePreviewPath,
    setAssistantQuoteSource,
    setPromptNavigatorOpen,
    setSessionInfoOpen,
    setFilePreviewPath,
    resetForSessionChange,
  } = useChatLocalState();
  const { colors, dark, preferences } = shell;
  const {
    activeModelPreset,
    changeModelPreset,
    modelDisplayLabel,
    orderedModelPresets,
    settings,
  } = shell.model;
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
  const composerController = useComposerController({
    cliApps: props.cliApps,
    limits: props.bootstrap!.limits,
    mcpPresets: props.mcpPresets,
    onSendMessage: props.sendMessage,
    onStopTurn: props.stopTurn,
    onTranscribeAudio: props.transcribeAudio,
    settings,
    skills: props.skills,
    slashCommands: props.slashCommands,
    turnActive: props.turnActive,
  });
  const { reset: resetComposer, setQuotedContext } = composerController;

  const hasMessages = props.messages.length > 0;
  const hasUserPrompts = props.messages.some((message) => message.role === 'user');
  const units = useMemo(
    () => normalizeActivityTimeline(props.messages, {
      preserveTrailingActivity: props.turnActive,
    }),
    [props.messages, props.turnActive],
  );
  const unitKeys = useMemo(() => unitKeysForDisplay(units), [units]);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);

  const retryFromMessage = useCallback((messageId: string) => async () => {
    if (props.turnActive || retryingMessageId) return;
    setRetryingMessageId(messageId);
    try {
      await props.retryFromMessage(messageId);
    } finally {
      setRetryingMessageId(null);
    }
  }, [props, retryingMessageId]);

  const lastMessageUnitIndex = useMemo(() => {
    for (let i = units.length - 1; i >= 0; i -= 1) {
      const unit = units[i];
      if (unit.type === 'message') return i;
    }
    return -1;
  }, [units]);

  function canRetryFromMessage(unit: TurnUnit, unitIndex: number): boolean {
    if (unit.type !== 'message') return false;
    const message = unit.message;
    if (message.role !== 'assistant' || message.kind === 'trace') return false;
    if (message.isStreaming) return false;
    // Retry is offered only on the very last assistant message of the
    // thread so we don't trample intermediate checkpoints. Older assistant
    // replies can still be forked.
    if (unitIndex !== lastMessageUnitIndex) return false;
    const tailHasUserPrompt = units.slice(unitIndex + 1).some(
      (row) => row.type === 'message' && row.message.role === 'user',
    );
    if (tailHasUserPrompt) return false;
    return true;
  }

  const forkIndexes = useMemo(
    () => assistantForkIndexes(units, props.userMessageOffset),
    [props.userMessageOffset, units],
  );
  const forkBoundaryAfterUnitIndex = useMemo(
    () => unitIndexAfterMessageCount(units, props.forkBoundaryMessageCount),
    [props.forkBoundaryMessageCount, units],
  );
  const liveActivityClusterIndices = useMemo(
    () => props.turnActive ? currentActivityClusterIndices(units) : new Set<number>(),
    [props.turnActive, units],
  );
  const resolveFilePreviewAvailability = useFilePreviewAvailability({
    activeKey: props.activeKey,
    apiToken: props.bootstrap!.api_token,
    revision: props.messages.length,
  });

  const chatTitle = props.activeSession
    ? props.sidebarState.title_overrides[props.activeSession.key] || sessionTitle(props.activeSession)
    : t('sidebar.newChat');




  const handleSessionReset = useCallback(() => {
    resetForSessionChange();
    setQuotedContext(null);
  }, [resetForSessionChange, setQuotedContext]);

  useEffect(() => {
    resetForSessionChange();
    resetComposer();
  }, [resetComposer, resetForSessionChange, shell.navigationRevision]);

  const {
    listRef,
    atBottom,
    scrollToBottom,
    loadEarlier,
    handleThreadScroll,
    handleContentSizeChange,
    jumpToPrompt,
    handleScrollToIndexFailed,
    onMomentumScrollEnd,
    onScrollBeginDrag,
    onScrollEndDrag,
  } = useChatScroll({
    activeKey: props.activeKey,
    hasMessages,
    messages: props.messages,
    units,
    loadingOlder,
    hasMoreBefore,
    onLoadOlder: loadOlder,
    onSessionReset: handleSessionReset,
  });
  const forkFromMessage = async (messageId: string, beforeUserIndex: number) => {
    if (forkingMessageId) return;
    composerController.clearQueue();
    setForkingMessageId(messageId);
    try {
      await props.forkFromMessage(beforeUserIndex);
    } catch {
      // The app hook exposes the server error in the persistent banner.
    } finally {
      setForkingMessageId(null);
    }
  };

  const composer = (
    <>
      {props.streamError ? (
        <StreamErrorNotice
          colors={colors}
          error={props.streamError}
          onDismiss={props.dismissStreamError}
        />
      ) : null}
      <ExtractedComposer
        attachmentError={composerController.attachments.error}
        attachments={composerController.attachments.attachments}
        attachmentBusy={composerController.attachments.encoding}
        attachmentFull={composerController.attachments.full}
        activeModelPreset={activeModelPreset}
        colors={colors}
        dark={dark}
        disabled={composerController.sending}
        goalState={props.goalState}
        inputRef={composerController.inputRef}
        modelName={modelDisplayLabel}
        mentionCandidates={composerController.visibleMentionCandidates}
        skillCandidates={composerController.visibleSkillCandidates}
        modelPresets={orderedModelPresets}
        quotedContext={composerController.quotedContext}
        runStartedAt={props.runStartedAt}
        workspaceScope={props.activeWorkspaceScope}
        workspaceDefaultScope={props.workspaces?.default_scope ?? null}
        workspaceControls={props.workspaces?.controls ?? null}
        workspaceError={props.workspaceError}
        workspaceScopeDisabled={props.turnActive}
        onWorkspaceScopeChange={props.updateWorkspaceScope}
        onAddAttachment={composerController.openAttachmentMenu}
        onChangeText={composerController.onChangeText}
        onClearQuote={() => composerController.setQuotedContext(null)}
        onCursorChange={composerController.onCursorChange}
        onMentionCandidateSelect={composerController.selectMentionCandidate}
        onSkillCandidateSelect={composerController.selectSkillCandidate}
        onModelPresetChange={changeModelPreset}
        onOpenModelSettings={shell.onOpenSettings}
        onRemoveQueuedPrompt={composerController.removeQueuedPrompt}
        onRemoveAttachment={composerController.attachments.remove}
        onSelectSlashCommand={composerController.selectSlashCommand}
        onSend={composerController.submit}
        onStop={composerController.handleStop}
        queuedPrompts={composerController.queuedPrompts}
        readyAttachmentCount={composerController.attachments.readyAttachments.length}
        slashCommands={composerController.visibleSlashCommands}
        turnActive={props.turnActive}
        value={composerController.text}
        variant={hasMessages || props.threadLoading ? 'thread' : 'hero'}
        voiceError={composerController.voiceError ? t(`thread.composer.voiceErrors.${composerController.voiceError}`) : null}
        voiceRecorder={composerController.voiceRecorder}
      />
    </>
  );

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <View style={{ height: insets.top, backgroundColor: colors.background }} />
      <ChatHeader
        activeKey={props.activeKey}
        colors={colors}
        dark={dark}
        preferences={preferences}
        utilityView={shell.utilityView}
        chatTitle={chatTitle}
        hasUserPrompts={hasUserPrompts}
        onOpenDrawer={shell.onOpenDrawer}
        onOpenPromptNavigator={() => setPromptNavigatorOpen(true)}
        onOpenSessionInfo={() => setSessionInfoOpen(true)}
        onChangePreferences={shell.onChangePreferences}
      />

      {props.error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground }]}>
          <Text numberOfLines={2} style={[styles.errorText, { color: colors.errorText }]}>{props.error}</Text>
          <Pressable accessibilityLabel={t('common.dismiss')} hitSlop={8} onPress={props.clearError}>
            <X color={colors.errorText} size={16} />
          </Pressable>
        </View>
      ) : null}

      {shell.utilityView === 'chat' ? (
        <ChatSurface
          colors={colors}
          composer={composer}
          hasMessages={hasMessages}
          threadLoading={props.threadLoading}
          threadProps={{
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
            cliApps: props.cliApps,
            mcpPresets: props.mcpPresets,
            slashCommands: props.slashCommands,
            hasMoreBefore: props.hasMoreBefore,
            loadingOlder: props.loadingOlder,
            canRetryFromMessage,
            forkFromMessage,
            retryFromMessage,
            resolveFilePreviewAvailability,
            onOpenFilePreview: props.activeKey ? setFilePreviewPath : undefined,
            onQuote: setAssistantQuoteSource,
          }}
        />
      ) : (
        shell.utilityContent
      )}
      <View style={{ height: Math.max(insets.bottom, 7), backgroundColor: colors.background }} />

      <ChatModals
        activeKey={props.activeKey}
        colors={colors}
        dark={dark}
        chatTitle={chatTitle}
        messages={props.messages}
        promptNavigatorOpen={promptNavigatorOpen}
        sessionInfoOpen={sessionInfoOpen}
        assistantQuoteSource={assistantQuoteSource}
        filePreviewPath={filePreviewPath}
        token={props.bootstrap!.api_token}
        onClosePromptNavigator={() => setPromptNavigatorOpen(false)}
        onCloseSessionInfo={() => setSessionInfoOpen(false)}
        onCloseAssistantQuote={() => setAssistantQuoteSource(null)}
        onCloseFilePreview={() => setFilePreviewPath(null)}
        onConfirmAssistantQuote={composerController.confirmQuote}
        onJumpToPrompt={jumpToPrompt}
        onGetSessionAutomations={props.getSessionAutomations}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errorBanner: {
    marginHorizontal: 13,
    marginTop: 3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
