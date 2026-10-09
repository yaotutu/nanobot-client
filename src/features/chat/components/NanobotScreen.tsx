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
import { useHeaderActivity } from '@/features/chat/hooks/use-header-activity';
import { useChatScroll } from '@/features/chat/hooks/useChatScroll';
import { useComposerController } from '@/features/chat/hooks/use-composer-controller';
import { useFilePreviewAvailability } from '@/features/chat/hooks/use-file-preview-availability';
import { useMessageActions } from '@/features/chat/hooks/use-message-actions';
import type {
  ChatModelSelection,
  ChatScreenController,
} from '@/features/chat/model/chat-screen-contract';
import { useChatStore } from '@/features/chat/store';
import { DEFAULT_THEME_ID, resolveChatPalette, themeModeForDark } from '@/features/theme';

interface NanobotScreenProps {
  controller: ChatScreenController;
  dark: boolean;
  model: ChatModelSelection;
  navigationRevision: number;
  chatOptionsOpen: boolean;
  onCloseChatOptions: () => void;
  onOpenConversations: () => void;
  onOpenChatOptions: () => void;
}

export function NanobotScreen({ controller, ...shell }: NanobotScreenProps) {
  const { session, capabilities, thread, runtime, errors } = controller;
  // 消息属于聊天页内部的高频状态；在这里订阅可以避免 ReadyAppShell 随每个流式片段重建。
  const messages = useChatStore((state) => state.messages);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const {
    assistantQuoteSource,
    promptNavigatorOpen,
    filePreviewPath,
    agentActivitySheetOpen,
    setAssistantQuoteSource,
    setAgentActivitySheetOpen,
    setPromptNavigatorOpen,
    setFilePreviewPath,
    resetForSessionChange,
  } = useChatLocalState();
  const { dark } = shell;
  const colors = resolveChatPalette(DEFAULT_THEME_ID, themeModeForDark(dark));
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
  const {
    reset: resetComposer,
    setQuotedContext,
    onChangeText: changeComposerText,
    inputRef: composerInputRef,
  } = composerController;

  const hasMessages = messages.length > 0;
  const hasUserPrompts = messages.some((message) => message.role === 'user');
  const threadModel = useChatThreadModel({
    forkBoundaryMessageCount: thread.forkBoundaryMessageCount,
    messages,
    turnActive: runtime.turnActive,
    userMessageOffset: thread.userMessageOffset,
  });
  const headerActivity = useHeaderActivity({
    cliApps: capabilities.cliApps,
    mcpPresets: capabilities.mcpPresets,
    turnActive: runtime.turnActive,
    units: threadModel.units,
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
    revision: messages.length,
  });

  // 空状态引导只改变输入草稿并聚焦，不触碰发送队列，保持聊天核心行为不变。
  const handleUsePrompt = useCallback((prompt: string) => {
    changeComposerText(prompt);
    composerInputRef.current?.focus();
  }, [changeComposerText, composerInputRef]);

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
      optionsOpen={shell.chatOptionsOpen}
      hasUserPrompts={hasUserPrompts}
      onOpenPromptNavigator={() => {
        // 两个入口都是 Modal，先退出聊天选项，再打开消息导航，避免 Android 返回键层级混乱。
        shell.onCloseChatOptions();
        setPromptNavigatorOpen(true);
      }}
      onCloseOptions={shell.onCloseChatOptions}
    />
  );

  return (
    <KeyboardAvoidingView
      behavior="height"
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      {/* 显式跟随应用主题，不能让系统浅色模式把暗色页面的状态栏文字变成黑色。 */}
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* 内容层占满安全区；顶部不再为 Header 预留固定高度，让历史消息可以进入原空白区域。 */}
      <View style={[styles.contentLayer, { paddingTop: insets.top }]}>
        <ChatSurface
          colors={colors}
          composer={composer}
          hasMessages={hasMessages}
          onUsePrompt={handleUsePrompt}
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
      </View>
      {/* 悬浮层只拦截按钮和提示条自身；空白区域继续把触摸与滚动交给下面的消息列表。 */}
      <View pointerEvents="box-none" style={styles.floatingHeaderLayer}>
        <View pointerEvents="none" style={{ height: insets.top }} />
        <ChatHeader
          colors={colors}
          onOpenConversations={shell.onOpenConversations}
          onOpenChatOptions={shell.onOpenChatOptions}
          onOpenAgentActivity={() => setAgentActivitySheetOpen(true)}
          headerActivity={headerActivity}
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
      </View>

      <ChatModals
        activeKey={session.activeKey}
        colors={colors}
        dark={dark}
        messages={messages}
        promptNavigatorOpen={promptNavigatorOpen}
        agentActivitySheetOpen={agentActivitySheetOpen}
        cliApps={capabilities.cliApps}
        mcpPresets={capabilities.mcpPresets}
        turnActive={runtime.turnActive}
        units={threadModel.units}
        assistantQuoteSource={assistantQuoteSource}
        filePreviewPath={filePreviewPath}
        token={capabilities.bootstrap.api_token}
        onClosePromptNavigator={() => setPromptNavigatorOpen(false)}
        onCloseAssistantQuote={() => setAssistantQuoteSource(null)}
        onCloseFilePreview={() => setFilePreviewPath(null)}
        onCloseAgentActivity={() => setAgentActivitySheetOpen(false)}
        onOpenFilePreview={(path) => {
          // 预览是全屏弹窗；打开前先关闭活动面板，避免两层 Modal 抢返回键。
          setAgentActivitySheetOpen(false);
          setFilePreviewPath(path);
        }}
        onConfirmAssistantQuote={composerController.confirmQuote}
        onJumpToPrompt={jumpToPrompt}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative' },
  // 消息层占满屏幕；安全区只阻止内容顶到系统栏，不保留 Header 高度。
  contentLayer: { minHeight: 0, flex: 1 },
  // Header 与提示条作为浮层叠在消息上；box-none 由 JSX 属性控制命中区域。
  floatingHeaderLayer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
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
