import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AuthScreen } from '@/components/auth-screen';
import { NanobotScreen } from '@/components/nanobot-screen';
import { useNanobotApp } from '@/hooks/use-nanobot-app';

export default function HomeScreen() {
  const app = useNanobotApp();
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

  return (
    <NanobotScreen
      activeKey={app.activeKey}
      activeSession={app.activeSession}
      activeWorkspaceScope={app.activeWorkspaceScope}
      bootstrap={app.bootstrap}
      connectionStatus={app.connectionStatus}
      goalState={app.goalState}
      cliApps={app.cliApps}
      error={app.error}
      messages={app.messages}
      mcpPresets={app.mcpPresets}
      skills={app.skills}
      onCliAppsChanged={app.applyCliAppsPayload}
      forkBoundaryMessageCount={app.forkBoundaryMessageCount}
      hasMoreBefore={app.hasMoreBefore}
      loadingOlder={app.loadingOlder}
      onClearError={app.clearError}
      onDismissStreamError={app.dismissStreamError}
      onDeleteSession={app.removeSession}
      onGetSessionAutomations={app.getSessionAutomations}
      onForkFromMessage={app.forkFromMessage}
      onRetryFromMessage={app.retryFromMessage}
      onLoadOlder={app.loadOlder}
      onModelPresetChange={app.changeModelPreset}
      onLogout={app.logout}
      onMcpPresetsChanged={app.applyMcpPresetsPayload}
      onRenameSession={app.renameSession}
      onRenameProject={app.renameProject}
      onSelectSession={app.selectSession}
      onStartNewChat={app.startNewChat}
      onStartNewChatInProject={app.startNewChatInProject}
      onSendMessage={app.sendMessage}
      onTranscribeAudio={app.transcribeAudio}
      onSetShowArchived={app.setShowArchived}
      onRestart={app.restartServer}
      onStopTurn={app.stopTurn}
      onToggleArchived={app.toggleArchived}
      onTogglePinned={app.togglePinned}
      onToggleSidebarGroup={app.toggleSidebarGroup}
      onWorkspaceScopeChange={app.updateWorkspaceScope}
      runStartedAt={app.runStartedAt}
      runtimeModelName={app.runtimeModelName}
      sessions={app.sessions}
      sessionsLoading={app.sessionsLoading}
      sidebarState={app.sidebarState}
      streamError={app.streamError}
      workspaces={app.workspaces}
      workspaceError={app.workspaceError}
      slashCommands={app.slashCommands}
      threadLoading={app.threadLoading}
      turnActive={app.turnActive}
      turnModelName={app.turnModelName}
      modelSettingsRevision={app.modelSettingsRevision}
      userMessageOffset={app.userMessageOffset}
    />
  );
}

const styles = StyleSheet.create({
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
