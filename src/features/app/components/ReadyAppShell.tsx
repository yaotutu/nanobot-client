import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppModals } from '@/features/app/components/AppModals';
import { useAppController } from '@/features/app/hooks/use-app-controller';
import { useAppModelSelection } from '@/features/app/hooks/use-app-model-selection';
import { useAppNavigation } from '@/features/app/hooks/use-app-navigation';
import { useAppPreferences } from '@/features/app/hooks/use-app-preferences';
import { chatPaletteForTheme, NanobotScreen } from '@/features/chat/screen';
import { useUpdates, hasUpdate, UpdateDetails, updateSummaryKey } from '@/features/updates';
import { PreferencesModal } from '@/features/settings';
import { markStartup } from '@/services/runtime/startup-performance';
import { DARK_COLORS, LIGHT_COLORS } from '@/ui/colors';

/**
 * 已完成鉴权后的完整工作区。
 *
 * 这个组件会引入聊天编辑器、消息渲染以及会话面板等较大的 UI 依赖，因此必须与启动壳分离。
 * AppShell 先完成鉴权和连接状态渲染，再按需加载这里，避免低性能 Android 设备在首帧前
 * 同步执行整棵业务组件树。
 */
export function ReadyAppShell() {
  const updates = useUpdates();
  const app = useAppController();
  const navigation = useAppNavigation();
  useEffect(() => {
    markStartup('ready_shell_mounted');
  }, []);
  const { preferences, changePreferences, changeServerUrl } = useAppPreferences();
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
  const { logout } = app.runtime;
  const { openConversations, openSearch } = navigation;
  const refreshSessions = app.sidebar.refreshSessions;

  // 会话数据只在登录后和新建会话后刷新；服务端历史可能被其他客户端删除，
  // 因此每次打开历史入口前主动拉取一次，避免长期驻留的客户端展示旧列表。
  const openFreshConversations = useCallback(() => {
    openConversations();
    void refreshSessions();
  }, [openConversations, refreshSessions]);

  const openFreshSearch = useCallback(() => {
    openSearch();
    void refreshSessions();
  }, [openSearch, refreshSessions]);

  // 设置页只接收展示契约；更新状态与用户操作仍由 updates feature 封装。
  const updateSection = {
    sectionLabelKey: 'updates.appGroup',
    titleKey: 'updates.title',
    hintKey: 'updates.hint',
    summaryKey: updateSummaryKey(updates),
    available: hasUpdate(updates),
    availableA11yKey: 'updates.updateAvailableA11y',
    renderDetails: (sectionColors: typeof colors) => <UpdateDetails colors={sectionColors} updates={updates} />,
  };

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

  // 切换服务器等价于切换账号环境：关闭旧 socket、清空内存数据并重新登录。
  // 不复用旧 token，避免不同 gateway 的会话 ID、工作区和鉴权上下文串在一起。
  const switchServer = useCallback(async (serverUrl: string) => {
    await logout();
    changeServerUrl(serverUrl);
  }, [changeServerUrl, logout]);

  return (
    <View style={styles.root}>
      <NanobotScreen
        controller={chatController}
        dark={dark}
        model={model}
        chatOptionsOpen={navigation.chatOptionsOpen}
        onCloseChatOptions={() => navigation.setChatOptionsOpen(false)}
        navigationRevision={navigation.chatResetRevision}
        onOpenConversations={openFreshConversations}
        onOpenChatOptions={navigation.openChatOptions}
      />
      <PreferencesModal
        updateSection={updateSection}
        colors={colors}
        preferences={preferences}
        visible={navigation.preferencesOpen}
        onChange={changePreferences}
        onServerChange={switchServer}
        onClose={() => navigation.setPreferencesOpen(false)}
        onLogout={logout}
      />
      <AppModals
        updateAvailable={hasUpdate(updates)}
        app={app}
        colors={chatPaletteForTheme(dark)}
        conversationsOpen={navigation.conversationsOpen}
        onCloseConversations={() => navigation.setConversationsOpen(false)}
        onCloseSessionSearch={() => navigation.setSessionSearchOpen(false)}
        onOpenSearch={openFreshSearch}
        onOpenPreferences={navigation.openPreferences}
        onSelectSession={selectSession}
        onStartNewChat={startNewChat}
        onStartNewChatInProject={startNewChatInProject}
        sessionSearchOpen={navigation.sessionSearchOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
