import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppModals } from '@/features/app/components/AppModals';
import { AppUtilityRouter } from '@/features/app/components/AppUtilityRouter';
import { AppUtilityWorkspace } from '@/features/app/components/AppUtilityWorkspace';
import { useAppController } from '@/features/app/hooks/use-app-controller';
import { useAppModelSelection } from '@/features/app/hooks/use-app-model-selection';
import { useAppNavigation } from '@/features/app/hooks/use-app-navigation';
import { useAppPreferences } from '@/features/app/hooks/use-app-preferences';
import { NanobotScreen } from '@/features/chat/screen';
import { markStartup } from '@/services/runtime/startup-performance';
import { DARK_COLORS, LIGHT_COLORS } from '@/ui/colors';

/**
 * 已完成鉴权后的完整工作区。
 *
 * 这个组件会引入聊天编辑器、消息渲染以及侧边栏等较大的 UI 依赖，因此必须与启动壳分离。
 * AppShell 先完成鉴权和连接状态渲染，再按需加载这里，避免低性能 Android 设备在首帧前
 * 同步执行整棵业务组件树。
 */
export function ReadyAppShell() {
  const app = useAppController();
  const navigation = useAppNavigation();
  useEffect(() => {
    markStartup('ready_shell_mounted');
  }, []);
  const { preferences, changePreferences } = useAppPreferences();
  const dark = preferences.theme === 'dark';
  const colors = dark ? DARK_COLORS : LIGHT_COLORS;
  const bootstrap = app.auth.bootstrap!;
  const model = useAppModelSelection({
    activeSession: app.model.activeSession,
    bootstrap,
    modelSettingsRevision: app.model.modelSettingsRevision,
    onModelPresetChange: app.model.changeModelPreset,
    runtimeModelName: app.model.runtimeModelName,
    turnModelName: app.model.turnModelName,
  });

  const chatController = app.chat!;

  const selectSession = useCallback((key: string | null) => {
    navigation.resetChat();
    app.sidebar.selectSession(key);
  }, [app, navigation]);

  const startNewChat = useCallback(() => {
    navigation.resetChat();
    app.workspace.startNewChat();
  }, [app, navigation]);

  const startNewChatInProject = useCallback((projectPath: string, projectName: string) => {
    navigation.resetChat();
    app.workspace.startNewChatInProject(projectPath, projectName);
  }, [app, navigation]);

  const openLinkedChat = useCallback((sessionKey: string) => {
    navigation.resetChat();
    app.sidebar.selectSession(sessionKey);
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
            onRestart={app.runtime.restartServer}
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
});
