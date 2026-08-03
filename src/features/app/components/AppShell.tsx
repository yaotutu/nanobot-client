import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppModals } from '@/features/app/components/AppModals';
import { AppUtilityRouter } from '@/features/app/components/AppUtilityRouter';
import { AppUtilityWorkspace } from '@/features/app/components/AppUtilityWorkspace';
import { useAppController, type AppController } from '@/features/app/hooks/use-app-controller';
import { useAppModelSelection } from '@/features/app/hooks/use-app-model-selection';
import { useAppNavigation } from '@/features/app/hooks/use-app-navigation';
import { useAppPreferences } from '@/features/app/hooks/use-app-preferences';
import { AuthScreen } from '@/features/auth/components/AuthScreen';
import { NanobotScreen } from '@/features/chat/components/NanobotScreen';
import type { ChatScreenController } from '@/features/chat/model/chat-screen-contract';
import { DARK_COLORS, LIGHT_COLORS } from '@/ui/colors';

export function AppShell() {
  const app = useAppController();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (app.phase === 'authentication') {
    return <AuthScreen failed={app.authenticationFailed} onSubmit={app.authenticate} />;
  }

  if (app.phase === 'unreachable') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.errorTitle}>{t('app.error.title')}</Text>
        <Text style={styles.errorMessage}>{app.error ?? t('app.error.gatewayHint')}</Text>
        <Pressable onPress={app.retryConnection} style={styles.retryButton}>
          <Text style={styles.retryText}>{t('settings.channels.reconnect')}</Text>
        </Pressable>
      </View>
    );
  }

  if (app.phase === 'booting' || !app.bootstrap) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator color="#6F6E69" />
        <Text style={styles.loadingText}>{t('app.loading.connecting')}</Text>
      </View>
    );
  }

  return <ReadyAppShell app={app} />;
}

function ReadyAppShell({ app }: { app: AppController }) {
  const navigation = useAppNavigation();
  const { preferences, changePreferences } = useAppPreferences();
  const dark = preferences.theme === 'dark';
  const colors = dark ? DARK_COLORS : LIGHT_COLORS;
  const bootstrap = app.bootstrap!;
  const model = useAppModelSelection({
    activeSession: app.activeSession,
    bootstrap,
    modelSettingsRevision: app.modelSettingsRevision,
    onModelPresetChange: app.changeModelPreset,
    runtimeModelName: app.runtimeModelName,
    turnModelName: app.turnModelName,
  });

  const chatController: ChatScreenController = {
    session: {
      activeKey: app.activeKey,
      activeSession: app.activeSession,
      sidebarState: app.sidebarState,
    },
    capabilities: {
      bootstrap,
      cliApps: app.cliApps,
      mcpPresets: app.mcpPresets,
      skills: app.skills,
      slashCommands: app.slashCommands,
    },
    thread: {
      messages: app.messages,
      loading: app.threadLoading,
      loadingOlder: app.loadingOlder,
      hasMoreBefore: app.hasMoreBefore,
      userMessageOffset: app.userMessageOffset,
      forkBoundaryMessageCount: app.forkBoundaryMessageCount,
      loadOlder: app.loadOlder,
      retryFromMessage: app.retryFromMessage,
      forkFromMessage: app.forkFromMessage,
    },
    runtime: {
      turnActive: app.turnActive,
      runStartedAt: app.runStartedAt,
      goalState: app.goalState,
      sendMessage: app.sendMessage,
      stopTurn: app.stopTurn,
      transcribeAudio: app.transcribeAudio,
    },
    workspace: {
      activeScope: app.activeWorkspaceScope,
      catalog: app.workspaces,
      error: app.workspaceError,
      updateScope: app.updateWorkspaceScope,
    },
    errors: {
      current: app.error,
      stream: app.streamError,
      clear: app.clearError,
      dismissStream: app.dismissStreamError,
    },
    automations: {
      getForSession: app.getSessionAutomations,
    },
  };

  const selectSession = useCallback((key: string | null) => {
    navigation.resetChat();
    app.selectSession(key);
  }, [app, navigation]);

  const startNewChat = useCallback(() => {
    navigation.resetChat();
    app.startNewChat();
  }, [app, navigation]);

  const startNewChatInProject = useCallback((projectPath: string, projectName: string) => {
    navigation.resetChat();
    app.startNewChatInProject(projectPath, projectName);
  }, [app, navigation]);

  const openLinkedChat = useCallback((sessionKey: string) => {
    navigation.resetChat();
    app.selectSession(sessionKey);
  }, [app, navigation]);

  return (
    <View style={styles.root}>
      {navigation.utilityView === 'chat' ? (
        <NanobotScreen
          colors={colors}
          controller={chatController}
          dark={dark}
          model={model}
          navigationRevision={navigation.chatResetRevision}
          onChangePreferences={changePreferences}
          onOpenDrawer={() => navigation.setDrawerOpen(true)}
          onOpenSettings={() => navigation.openUtility('settings')}
          preferences={preferences}
        />
      ) : (
        <AppUtilityWorkspace
          colors={colors}
          dark={dark}
          onChangePreferences={changePreferences}
          onOpenDrawer={() => navigation.setDrawerOpen(true)}
          preferences={preferences}
          view={navigation.utilityView}
        >
          <AppUtilityRouter
            bootstrap={bootstrap}
            colors={colors}
            onBackToChat={navigation.returnToChat}
            onChangePreferences={changePreferences}
            onOpenLinkedChat={openLinkedChat}
            onRestart={app.restartServer}
            onSettingsChange={model.setSettings}
            preferences={preferences}
            runtimePolicy={model.runtimePolicy}
            view={navigation.utilityView}
          />
        </AppUtilityWorkspace>
      )}
      <AppModals
        app={app}
        colors={colors}
        drawerOpen={navigation.drawerOpen}
        onCloseDrawer={() => navigation.setDrawerOpen(false)}
        onCloseSessionSearch={() => navigation.setSessionSearchOpen(false)}
        onOpenSearch={navigation.openSearch}
        onOpenUtility={navigation.openUtility}
        onSelectSession={selectSession}
        onStartNewChat={startNewChat}
        onStartNewChatInProject={startNewChatInProject}
        sessionSearchOpen={navigation.sessionSearchOpen}
        utilityView={navigation.utilityView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF9',
    paddingHorizontal: 28,
    gap: 12,
  },
  loadingText: { color: '#777672', fontSize: 13 },
  errorTitle: { color: '#252421', fontSize: 20, fontWeight: '600' },
  errorMessage: { color: '#777672', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retryButton: { marginTop: 8, minWidth: 128, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#242320' },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
