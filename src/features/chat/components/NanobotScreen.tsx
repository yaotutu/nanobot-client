import { StatusBar } from 'expo-status-bar';
import X from 'lucide-react-native/icons/x';
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
import { chatPaletteForTheme } from '@/features/chat/ui/chat-theme';

interface NanobotScreenProps {
  controller: ChatScreenController;
  dark: boolean;
  model: ChatModelSelection;
  navigationRevision: number;
  onOpenDrawer: () => void;
  onStartNewChat: () => void;
}

export function NanobotScreen({ controller, ...shell }: NanobotScreenProps) {
  const { session, capabilities, thread, runtime, errors } = controller;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const {
    assistantQuoteSource,
    promptNavigatorOpen,
    filePreviewPath,
    setAssistantQuoteSource,
    setPromptNavigatorOpen,
    setFilePreviewPath,
    resetForSessionChange,
  } = useChatLocalState();
  const { dark } = shell;
  const colors = chatPaletteForTheme(dark);
  const composerController = useComposerController({
    cliApps: capabilities.cliApps,
    limits: capabilities.bootstrap.limits,
    modelPreset: shell.model.activeModelPreset,
    mcpPresets: capabilities.mcpPresets,
    onSendMessage: runtime.sendMessage,
    onStopTurn: runtime.stopTurn,
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
    : t('app.brand');

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
      model={shell.model}
    />
  );

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      {/* 显式跟随应用主题，不能让系统浅色模式把暗色页面的状态栏文字变成黑色。 */}
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ height: insets.top, backgroundColor: colors.background }} />
      <ChatHeader
        colors={colors}
        chatTitle={chatTitle}
        hasUserPrompts={hasUserPrompts}
        onOpenDrawer={shell.onOpenDrawer}
        onOpenPromptNavigator={() => setPromptNavigatorOpen(true)}
        onStartNewChat={shell.onStartNewChat}
      />

      {!runtime.networkAvailable || runtime.connectionStatus !== 'open' || runtime.connectionSyncing ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void runtime.reconnect()}
          style={[styles.connectionBanner, { backgroundColor: !runtime.networkAvailable ? colors.errorBackground : colors.pressed }]}
        >
          <Text style={[styles.connectionText, { color: !runtime.networkAvailable ? colors.errorText : colors.muted }]}>
            {t(!runtime.networkAvailable
              ? 'connection.offline'
              : runtime.connectionSyncing
                ? 'connection.syncing'
                : `connection.${runtime.connectionStatus}`)}
          </Text>
          <Text style={[styles.connectionAction, { color: colors.foreground }]}>
            {t('settings.channels.reconnect')}
          </Text>
        </Pressable>
      ) : null}

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

      <ChatModals
        activeKey={session.activeKey}
        colors={colors}
        dark={dark}
        messages={thread.messages}
        promptNavigatorOpen={promptNavigatorOpen}
        assistantQuoteSource={assistantQuoteSource}
        filePreviewPath={filePreviewPath}
        token={capabilities.bootstrap.api_token}
        onClosePromptNavigator={() => setPromptNavigatorOpen(false)}
        onCloseAssistantQuote={() => setAssistantQuoteSource(null)}
        onCloseFilePreview={() => setFilePreviewPath(null)}
        onConfirmAssistantQuote={composerController.confirmQuote}
        onJumpToPrompt={jumpToPrompt}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  connectionBanner: {
    marginHorizontal: 18,
    marginTop: 4,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  connectionText: { flex: 1, fontSize: 13, lineHeight: 19 },
  connectionAction: { fontSize: 12, fontWeight: '600' },
  errorBanner: {
    marginHorizontal: 18,
    marginTop: 4,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
