import type { AppController } from '@/features/app/hooks/use-app-controller';
import type { AppUtilityView } from '@/features/app/model/navigation';
import { createDeferredComponent } from '@/hooks/use-deferred-component';
import type { Palette } from '@/ui/palette';

/**
 * 抽屉和搜索弹窗只有在用户主动打开时才加载。显式 loader 保留按需分包，
 * 同时避开 React.lazy/Suspense 在旧 Android Fabric 上的原生崩溃路径。
 */
const DeferredSessionSearchModal = createDeferredComponent(() => import(
  '@/features/chat/components/modals/session-search-modal'
).then(({ SessionSearchModal }) => SessionSearchModal));
const DeferredSidebarDrawer = createDeferredComponent(() => import(
  '@/features/sidebar/components/SidebarDrawer'
).then(({ SidebarDrawer }) => SidebarDrawer));

interface AppModalsProps {
  app: AppController;
  colors: Palette;
  drawerOpen: boolean;
  sessionSearchOpen: boolean;
  utilityView: AppUtilityView;
  onCloseDrawer: () => void;
  onCloseSessionSearch: () => void;
  onOpenSearch: () => void;
  onOpenUtility: (view: Exclude<AppUtilityView, 'chat'>) => void;
  onSelectSession: (key: string | null) => void;
  onStartNewChat: () => void;
  onStartNewChatInProject: (projectPath: string, projectName: string) => void;
}

export function AppModals(props: AppModalsProps) {
  const { app, colors } = props;

  return (
    <>
      {props.drawerOpen ? (
        <DeferredSidebarDrawer
          componentProps={{
            activeKey: app.chat?.session.activeKey ?? null,
            activeUtility: props.utilityView === 'chat' ? null : props.utilityView,
            connectionStatus: app.connection.status,
            networkAvailable: app.connection.networkAvailable,
            defaultWorkspacePath: app.workspace.catalog?.default_scope.project_path ?? null,
            loading: app.sidebar.loading,
            onClose: props.onCloseDrawer,
            onLogout: app.runtime.logout,
            onNewChat: props.onStartNewChat,
            onReconnect: app.connection.reconnect,
            onNewChatInProject: props.onStartNewChatInProject,
            onOpenSearch: props.onOpenSearch,
            onOpenApps: () => props.onOpenUtility('apps'),
            onOpenSkills: () => props.onOpenUtility('skills'),
            onOpenAutomations: () => props.onOpenUtility('automations'),
            onOpenSettings: () => props.onOpenUtility('settings'),
            onDelete: app.sidebar.removeSession,
            onGetSessionAutomations: app.sidebar.getSessionAutomations,
            onRename: app.sidebar.renameSession,
            onRenameProject: app.sidebar.renameProject,
            onSelect: props.onSelectSession,
            onSetShowArchived: app.sidebar.setShowArchived,
            onToggleArchived: app.sidebar.toggleArchived,
            onToggleGroup: app.sidebar.toggleGroup,
            onTogglePinned: app.sidebar.togglePinned,
            sessions: app.sidebar.sessions,
            state: app.sidebar.state,
            visible: true,
          }}
          enabled
        />
      ) : null}
      {props.sessionSearchOpen ? (
        <DeferredSessionSearchModal
          componentProps={{
            activeKey: app.chat?.session.activeKey ?? null,
            colors,
            loading: app.sidebar.loading,
            onClose: props.onCloseSessionSearch,
            onSelect: props.onSelectSession,
            sessions: app.sidebar.sessions,
            titleOverrides: app.sidebar.state.title_overrides,
            visible: true,
          }}
          enabled
        />
      ) : null}
    </>
  );
}
