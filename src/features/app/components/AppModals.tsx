import { SessionSearchModal } from '@/features/chat/components/modals/session-search-modal';
import { SidebarDrawer } from '@/features/sidebar/components/SidebarDrawer';
import type { AppController } from '@/features/app/hooks/use-app-controller';
import type { AppUtilityView } from '@/features/app/model/navigation';
import type { Palette } from '@/ui/palette';

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
      <SidebarDrawer
        activeKey={app.activeKey}
        activeUtility={props.utilityView === 'chat' ? null : props.utilityView}
        connectionStatus={app.connectionStatus}
        defaultWorkspacePath={app.workspaces?.default_scope.project_path ?? null}
        loading={app.sessionsLoading}
        onClose={props.onCloseDrawer}
        onLogout={app.logout}
        onNewChat={props.onStartNewChat}
        onNewChatInProject={props.onStartNewChatInProject}
        onOpenSearch={props.onOpenSearch}
        onOpenApps={() => props.onOpenUtility('apps')}
        onOpenSkills={() => props.onOpenUtility('skills')}
        onOpenAutomations={() => props.onOpenUtility('automations')}
        onOpenSettings={() => props.onOpenUtility('settings')}
        onDelete={app.removeSession}
        onGetSessionAutomations={app.getSessionAutomations}
        onRename={app.renameSession}
        onRenameProject={app.renameProject}
        onSelect={props.onSelectSession}
        onSetShowArchived={app.setShowArchived}
        onToggleArchived={app.toggleArchived}
        onToggleGroup={app.toggleSidebarGroup}
        onTogglePinned={app.togglePinned}
        sessions={app.sessions}
        state={app.sidebarState}
        visible={props.drawerOpen}
      />
      {props.sessionSearchOpen ? (
        <SessionSearchModal
          activeKey={app.activeKey}
          colors={colors}
          loading={app.sessionsLoading}
          onClose={props.onCloseSessionSearch}
          onSelect={props.onSelectSession}
          sessions={app.sessions}
          titleOverrides={app.sidebarState.title_overrides}
          visible
        />
      ) : null}
    </>
  );
}
