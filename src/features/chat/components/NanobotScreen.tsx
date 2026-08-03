import { X } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatComposerContainer } from '@/features/chat/components/ChatComposerContainer';
import { ChatHeader } from '@/features/chat/components/ChatHeader';
import { ChatModals } from '@/features/chat/components/ChatModals';
import { ChatSurface } from '@/features/chat/components/ChatSurface';
import { useChatLocalState } from '@/features/chat/hooks/use-chat-local-state';
import { useChatThreadModel } from '@/features/chat/hooks/use-chat-thread-model';
import { useChatScroll } from '@/features/chat/hooks/useChatScroll';
import { useComposerController } from '@/features/chat/hooks/use-composer-controller';
import { useFilePreviewAvailability } from '@/features/chat/hooks/use-file-preview-availability';
import { useMessageActions } from '@/features/chat/hooks/use-message-actions';
import type {
  ChatModelSelection,
  ChatScreenController,
} from '@/features/chat/model/chat-screen-contract';
import { sessionTitle } from '@/services/text/format';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import type { Palette } from '@/ui/palette';

interface NanobotScreenProps {
  controller: ChatScreenController;
  colors: Palette;
  dark: boolean;
  preferences: LocalPreferences;
  model: ChatModelSelection;
  navigationRevision: number;
  onChangePreferences: (next: LocalPreferences) => void;
  onOpenDrawer: () => void;
  onOpenSettings: () => void;
}

export function NanobotScreen({ controller, ...shell }: NanobotScreenProps) {
  const { session, capabilities, thread, runtime, errors, automations } = controller;
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
  const { settings } = shell.model;
  const composerController = useComposerController({
    cliApps: capabilities.cliApps,
    limits: capabilities.bootstrap.limits,
    mcpPresets: capabilities.mcpPresets,
    onSendMessage: runtime.sendMessage,
    onStopTurn: runtime.stopTurn,
    onTranscribeAudio: runtime.transcribeAudio,
    settings,
    skills: capabilities.skills,
    slashCommands: capabilities.slashCommands,
    turnActive: runtime.turnActive,
  });
  const { reset: resetComposer, setQuotedContext } = composerController;

  const hasMessages = thread.messages.length > 0;
  const hasUserPrompts = thread.messages.some((message) => message.role === 'user');
  const threadModel = useChatThreadModel({
    forkBoundaryMessageCount: thread.forkBoundaryMessageCount,
    messages: thread.messages,
    turnActive: runtime.turnActive,
    userMessageOffset: thread.userMessageOffset,
  });
  const messageActions = useMessageActions({
    clearComposerQueue: composerController.clearQueue,
    forkFromMessage: thread.forkFromMessage,
    retryFromMessage: thread.retryFromMessage,
    turnActive: runtime.turnActive,
  });
  const resolveFilePreviewAvailability = useFilePreviewAvailability({
    activeKey: session.activeKey,
    apiToken: capabilities.bootstrap.api_token,
    revision: thread.messages.length,
  });

  const chatTitle = session.activeSession
    ? session.sidebarState.title_overrides[session.activeSession.key]
      || sessionTitle(session.activeSession)
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
    activeKey: session.activeKey,
    hasMessages,
    messages: thread.messages,
    units: threadModel.units,
    loadingOlder: thread.loadingOlder,
    hasMoreBefore: thread.hasMoreBefore,
    onLoadOlder: thread.loadOlder,
    onSessionReset: handleSessionReset,
  });
  const composer = (
    <ChatComposerContainer
      colors={colors}
      composer={composerController}
      controller={controller}
      dark={dark}
      hasMessages={hasMessages}
      model={shell.model}
      onOpenSettings={shell.onOpenSettings}
    />
  );

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <View style={{ height: insets.top, backgroundColor: colors.background }} />
      <ChatHeader
        activeKey={session.activeKey}
        colors={colors}
        dark={dark}
        preferences={preferences}
        chatTitle={chatTitle}
        hasUserPrompts={hasUserPrompts}
        onOpenDrawer={shell.onOpenDrawer}
        onOpenPromptNavigator={() => setPromptNavigatorOpen(true)}
        onOpenSessionInfo={() => setSessionInfoOpen(true)}
        onChangePreferences={shell.onChangePreferences}
      />

      {errors.current ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground }]}>
          <Text numberOfLines={2} style={[styles.errorText, { color: colors.errorText }]}>
            {errors.current}
          </Text>
          <Pressable
            accessibilityLabel={t('common.dismiss')}
            hitSlop={8}
            onPress={errors.clear}
          >
            <X color={colors.errorText} size={16} />
          </Pressable>
        </View>
      ) : null}

      <ChatSurface
        colors={colors}
        composer={composer}
        hasMessages={hasMessages}
        threadLoading={thread.loading}
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
          units: threadModel.units,
          unitKeys: threadModel.unitKeys,
          forkIndexes: threadModel.forkIndexes,
          forkBoundaryAfterUnitIndex: threadModel.forkBoundaryAfterUnitIndex,
          liveActivityClusterIndices: threadModel.liveActivityClusterIndices,
          forkingMessageId: messageActions.forkingMessageId,
          retryingMessageId: messageActions.retryingMessageId,
          colors,
          dark,
          preferences,
          cliApps: capabilities.cliApps,
          mcpPresets: capabilities.mcpPresets,
          slashCommands: capabilities.slashCommands,
          hasMoreBefore: thread.hasMoreBefore,
          loadingOlder: thread.loadingOlder,
          canRetryFromMessage: threadModel.canRetryFromMessage,
          forkFromMessage: messageActions.forkFromMessage,
          retryFromMessage: messageActions.retryFromMessage,
          resolveFilePreviewAvailability,
          onOpenFilePreview: session.activeKey ? setFilePreviewPath : undefined,
          onQuote: setAssistantQuoteSource,
        }}
      />
      <View
        style={{
          height: Math.max(insets.bottom, 7),
          backgroundColor: colors.background,
        }}
      />

      <ChatModals
        activeKey={session.activeKey}
        colors={colors}
        dark={dark}
        chatTitle={chatTitle}
        messages={thread.messages}
        promptNavigatorOpen={promptNavigatorOpen}
        sessionInfoOpen={sessionInfoOpen}
        assistantQuoteSource={assistantQuoteSource}
        filePreviewPath={filePreviewPath}
        token={capabilities.bootstrap.api_token}
        onClosePromptNavigator={() => setPromptNavigatorOpen(false)}
        onCloseSessionInfo={() => setSessionInfoOpen(false)}
        onCloseAssistantQuote={() => setAssistantQuoteSource(null)}
        onCloseFilePreview={() => setFilePreviewPath(null)}
        onConfirmAssistantQuote={composerController.confirmQuote}
        onJumpToPrompt={jumpToPrompt}
        onGetSessionAutomations={automations.getForSession}
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
