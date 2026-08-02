import { X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  normalizeActivityTimeline,
  type TurnUnit,
} from '@/features/chat/activity-timeline';
import {
  assistantForkIndexes,
  currentActivityClusterIndices,
  unitIndexAfterMessageCount,
  unitKeysForDisplay,
} from "@/features/chat/components/timeline";
import { useChatScroll } from "@/features/chat/hooks/useChatScroll";
import { sessionTitle } from '@/services/text/format';
import { Composer as ExtractedComposer } from "@/features/chat/components/Composer";
import { ChatHeader } from "@/features/chat/components/ChatHeader";
import { ChatModals } from "@/features/chat/components/ChatModals";
import { LIGHT_COLORS, DARK_COLORS } from '@/ui/colors';
import type { SessionAutomationJob } from '@/types/api/automations';
import type {
  CliAppInfo,
  McpPresetInfo,
  SkillSummary,
} from '@/types/api/capabilities';
import type {
  SendAttachment,
  SendMessageOptions,
  SessionDeleteResult,
  SlashCommand,
  StreamError,
  UIMessage,
} from '@/types/api/chat';
import type {
  BootstrapResponse,
  ConnectionStatus,
  GoalStateWsPayload,
} from '@/types/api/runtime';
import type {
  ChatSummary,
  SidebarStatePayload,
} from '@/types/api/sidebar';
import type {
  WorkspaceScopePayload,
  WorkspacesPayload,
} from '@/types/api/workspaces';

import { StreamErrorNotice } from '@/features/chat/components/widgets/stream-error-notice';
import { ChatSurface } from '@/features/chat/components/ChatSurface';
import { UtilityViewRouter } from '@/features/chat/components/UtilityViewRouter';
import { useModelSelection } from '@/features/chat/hooks/use-model-selection';
import { useComposerController } from '@/features/chat/hooks/use-composer-controller';
import { useFilePreviewAvailability } from '@/features/chat/hooks/use-file-preview-availability';
import { useChatScreenState } from '@/features/chat/hooks/use-chat-screen-state';
import { useChatPreferences } from '@/features/chat/hooks/use-chat-preferences';

interface NanobotScreenProps {
  bootstrap: BootstrapResponse;
  connectionStatus: ConnectionStatus;
  cliApps: CliAppInfo[];
  sessions: ChatSummary[];
  sidebarState: SidebarStatePayload;
  sessionsLoading: boolean;
  activeKey: string | null;
  activeSession: ChatSummary | null;
  messages: UIMessage[];
  mcpPresets: McpPresetInfo[];
  skills: SkillSummary[];
  threadLoading: boolean;
  loadingOlder: boolean;
  hasMoreBefore: boolean;
  userMessageOffset: number;
  forkBoundaryMessageCount: number | null;
  turnActive: boolean;
  runStartedAt: number | null;
  goalState?: GoalStateWsPayload;
  runtimeModelName: string | null;
  turnModelName: string | null;
  modelSettingsRevision: number;
  slashCommands: SlashCommand[];
  error: string | null;
  streamError: StreamError | null;
  workspaces: WorkspacesPayload | null;
  activeWorkspaceScope: WorkspaceScopePayload | null;
  workspaceError: string | null;
  onClearError: () => void;
  onDismissStreamError: () => void;
  onWorkspaceScopeChange: (scope: WorkspaceScopePayload) => void;
  onSelectSession: (key: string | null) => void;
  onStartNewChat: () => void;
  onStartNewChatInProject: (projectPath: string, projectName: string) => void;
  onLoadOlder: () => Promise<void>;
  onModelPresetChange: (name: string) => Promise<void>;
  onForkFromMessage: (beforeUserIndex: number) => Promise<string>;
  onRetryFromMessage: (messageId: string) => Promise<void> | void;
  onTogglePinned: (key: string) => Promise<void>;
  onToggleArchived: (key: string) => Promise<void>;
  onToggleSidebarGroup: (groupId: string) => Promise<void>;
  onRenameSession: (key: string, title: string) => Promise<void>;
  onRenameProject: (projectKey: string, title: string) => Promise<void>;
  onSetShowArchived: (show: boolean) => Promise<void>;
  onDeleteSession: (
    key: string,
    options?: { deleteAutomations?: boolean },
  ) => Promise<SessionDeleteResult>;
  onGetSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
  onSendMessage: (
    content: string,
    attachments?: SendAttachment[],
    options?: SendMessageOptions,
  ) => Promise<void>;
  onTranscribeAudio: (
    dataUrl: string,
    options?: { durationMs?: number },
  ) => Promise<string>;
  onStopTurn: () => void;
  onRestart: () => void;
  onLogout: () => void;
}


export function NanobotScreen(props: NanobotScreenProps) {
  const { hasMoreBefore, loadingOlder, onLoadOlder } = props;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const {
    drawerOpen,
    sessionSearchOpen,
    utilityView,
    assistantQuoteSource,
    promptNavigatorOpen,
    sessionInfoOpen,
    filePreviewPath,
    setDrawerOpen,
    setSessionSearchOpen,
    setUtilityView,
    setAssistantQuoteSource,
    setPromptNavigatorOpen,
    setSessionInfoOpen,
    setFilePreviewPath,
    resetForSessionChange,
    openUtility,
    openSearch,
  } = useChatScreenState();
  const { preferences, changePreferences } = useChatPreferences();
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
  const dark = preferences.theme === 'dark';
  const colors = dark ? DARK_COLORS : LIGHT_COLORS;
  const {
    activeModelPreset,
    changeModelPreset,
    modelDisplayLabel,
    orderedModelPresets,
    runtimePolicy,
    settings,
    setSettings,
  } = useModelSelection({
    activeSession: props.activeSession,
    bootstrap: props.bootstrap,
    modelSettingsRevision: props.modelSettingsRevision,
    onModelPresetChange: props.onModelPresetChange,
    runtimeModelName: props.runtimeModelName,
    turnModelName: props.turnModelName,
  });
  const composerController = useComposerController({
    cliApps: props.cliApps,
    limits: props.bootstrap.limits,
    mcpPresets: props.mcpPresets,
    onSendMessage: props.onSendMessage,
    onStopTurn: props.onStopTurn,
    onTranscribeAudio: props.onTranscribeAudio,
    settings,
    skills: props.skills,
    slashCommands: props.slashCommands,
    turnActive: props.turnActive,
  });
  const { setQuotedContext } = composerController;

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
      await props.onRetryFromMessage(messageId);
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
    apiToken: props.bootstrap.api_token,
    revision: props.messages.length,
  });

  const chatTitle = props.activeSession
    ? props.sidebarState.title_overrides[props.activeSession.key] || sessionTitle(props.activeSession)
    : t('sidebar.newChat');




  const handleSessionReset = useCallback(() => {
    resetForSessionChange();
    setQuotedContext(null);
  }, [resetForSessionChange, setQuotedContext]);

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
    onLoadOlder,
    onSessionReset: handleSessionReset,
  });
  const resetSessionUi = () => {
    resetForSessionChange();
    composerController.reset();
  };

  const selectSession = (key: string | null) => {
    resetSessionUi();
    props.onSelectSession(key);
  };

  const startNewChat = () => {
    resetSessionUi();
    props.onStartNewChat();
  };

  const startNewChatInProject = (projectPath: string, projectName: string) => {
    resetSessionUi();
    props.onStartNewChatInProject(projectPath, projectName);
  };

  const forkFromMessage = async (messageId: string, beforeUserIndex: number) => {
    if (forkingMessageId) return;
    composerController.clearQueue();
    setForkingMessageId(messageId);
    try {
      await props.onForkFromMessage(beforeUserIndex);
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
          onDismiss={props.onDismissStreamError}
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
        onWorkspaceScopeChange={props.onWorkspaceScopeChange}
        onAddAttachment={composerController.openAttachmentMenu}
        onChangeText={composerController.onChangeText}
        onClearQuote={() => composerController.setQuotedContext(null)}
        onCursorChange={composerController.onCursorChange}
        onMentionCandidateSelect={composerController.selectMentionCandidate}
        onSkillCandidateSelect={composerController.selectSkillCandidate}
        onModelPresetChange={changeModelPreset}
        onOpenModelSettings={() => setUtilityView('settings')}
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
        utilityView={utilityView}
        chatTitle={chatTitle}
        hasUserPrompts={hasUserPrompts}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenPromptNavigator={() => setPromptNavigatorOpen(true)}
        onOpenSessionInfo={() => setSessionInfoOpen(true)}
        onChangePreferences={changePreferences}
      />

      {props.error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground }]}>
          <Text numberOfLines={2} style={[styles.errorText, { color: colors.errorText }]}>{props.error}</Text>
          <Pressable accessibilityLabel={t('common.dismiss')} hitSlop={8} onPress={props.onClearError}>
            <X color={colors.errorText} size={16} />
          </Pressable>
        </View>
      ) : null}

      {utilityView === 'chat' ? (
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
        <UtilityViewRouter
          bootstrap={props.bootstrap}
          colors={colors}
          onBackToChat={() => setUtilityView('chat')}
          onChangePreferences={changePreferences}
          onOpenLinkedChat={(sessionKey) => {
            setUtilityView('chat');
            props.onSelectSession(sessionKey);
          }}
          onRestart={props.onRestart}
          onSettingsChange={setSettings}
          preferences={preferences}
          runtimePolicy={runtimePolicy}
          view={utilityView}
        />
      )}
      <View style={{ height: Math.max(insets.bottom, 7), backgroundColor: colors.background }} />

      <ChatModals
        activeKey={props.activeKey}
        colors={colors}
        dark={dark}
        chatTitle={chatTitle}
        messages={props.messages}
        sessions={props.sessions}
        sidebarState={props.sidebarState}
        sessionsLoading={props.sessionsLoading}
        connectionStatus={props.connectionStatus}
        defaultWorkspacePath={props.workspaces?.default_scope.project_path ?? null}
        utilityView={utilityView}
        drawerOpen={drawerOpen}
        sessionSearchOpen={sessionSearchOpen}
        promptNavigatorOpen={promptNavigatorOpen}
        sessionInfoOpen={sessionInfoOpen}
        assistantQuoteSource={assistantQuoteSource}
        filePreviewPath={filePreviewPath}
        token={props.bootstrap.api_token}
        composerInputRef={composerController.inputRef}
        onCloseDrawer={() => setDrawerOpen(false)}
        onCloseSessionSearch={() => setSessionSearchOpen(false)}
        onClosePromptNavigator={() => setPromptNavigatorOpen(false)}
        onCloseSessionInfo={() => setSessionInfoOpen(false)}
        onCloseAssistantQuote={() => setAssistantQuoteSource(null)}
        onCloseFilePreview={() => setFilePreviewPath(null)}
        onConfirmAssistantQuote={composerController.confirmQuote}
        onJumpToPrompt={jumpToPrompt}
        onSelectSession={selectSession}
        onStartNewChat={startNewChat}
        onStartNewChatInProject={startNewChatInProject}
        onOpenSearch={openSearch}
        onOpenApps={() => openUtility('apps')}
        onOpenSkills={() => openUtility('skills')}
        onOpenAutomations={() => openUtility('automations')}
        onOpenSettings={() => openUtility('settings')}
        onLogout={props.onLogout}
        onDeleteSession={props.onDeleteSession}
        onGetSessionAutomations={props.onGetSessionAutomations}
        onRenameSession={props.onRenameSession}
        onRenameProject={props.onRenameProject}
        onSetShowArchived={props.onSetShowArchived}
        onToggleArchived={props.onToggleArchived}
        onToggleGroup={props.onToggleSidebarGroup}
        onTogglePinned={props.onTogglePinned}
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
