import { type RefObject } from 'react';

import type { SessionAutomationJob } from '@/types/api/automations';
import type {
  SessionDeleteResult,
  UIMessage,
} from '@/types/api/chat';
import type { ConnectionStatus } from '@/types/api/runtime';
import type {
  ChatSummary,
  SidebarStatePayload,
} from '@/types/api/sidebar';
import type { Palette } from '@/ui/palette';
import type { TextInput } from 'react-native';

import { AssistantQuoteModal } from '@/features/chat/components/modals/assistant-quote-modal';
import { FilePreviewModal } from '@/features/chat/components/modals/file-preview-modal';
import { PromptNavigator } from '@/features/chat/components/widgets/prompt-navigator';
import { SessionInfoModal } from '@/features/chat/components/modals/session-info-modal';
import { SessionSearchModal } from '@/features/chat/components/modals/session-search-modal';
import { SidebarDrawer } from '@/features/sidebar/components/SidebarDrawer';

export interface ChatModalsProps {
  colors: Palette;
  dark: boolean;

  activeKey: string | null;
  chatTitle: string;
  messages: UIMessage[];

  sessions: ChatSummary[];
  sidebarState: SidebarStatePayload;
  sessionsLoading: boolean;
  connectionStatus: ConnectionStatus;
  defaultWorkspacePath: string | null;
  utilityView: 'chat' | 'apps' | 'skills' | 'automations' | 'settings';

  drawerOpen: boolean;
  sessionSearchOpen: boolean;
  promptNavigatorOpen: boolean;
  sessionInfoOpen: boolean;
  assistantQuoteSource: string | null;
  filePreviewPath: string | null;

  token: string;
  composerInputRef: RefObject<TextInput | null>;

  onCloseDrawer: () => void;
  onCloseSessionSearch: () => void;
  onClosePromptNavigator: () => void;
  onCloseSessionInfo: () => void;
  onCloseAssistantQuote: () => void;
  onCloseFilePreview: () => void;
  onConfirmAssistantQuote: (content: string) => void;
  onJumpToPrompt: (messageId: string) => void;

  onSelectSession: (key: string | null) => void;
  onStartNewChat: () => void;
  onStartNewChatInProject: (projectPath: string, projectName: string) => void;
  onOpenSearch: () => void;
  onOpenApps: () => void;
  onOpenSkills: () => void;
  onOpenAutomations: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;

  onDeleteSession: (
    key: string,
    options?: { deleteAutomations?: boolean },
  ) => Promise<SessionDeleteResult>;
  onGetSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
  onRenameSession: (key: string, title: string) => Promise<void>;
  onRenameProject: (projectKey: string, title: string) => Promise<void>;
  onSetShowArchived: (show: boolean) => Promise<void>;
  onToggleArchived: (key: string) => Promise<void>;
  onToggleGroup: (groupId: string) => Promise<void>;
  onTogglePinned: (key: string) => Promise<void>;
}

export function ChatModals(props: ChatModalsProps) {
  const { colors, dark } = props;
  return (
    <>
      <SidebarDrawer
        activeKey={props.activeKey}
        activeUtility={props.utilityView === 'chat' ? null : props.utilityView}
        connectionStatus={props.connectionStatus}
        defaultWorkspacePath={props.defaultWorkspacePath}
        loading={props.sessionsLoading}
        onClose={props.onCloseDrawer}
        onLogout={props.onLogout}
        onNewChat={props.onStartNewChat}
        onNewChatInProject={props.onStartNewChatInProject}
        onOpenSearch={props.onOpenSearch}
        onOpenApps={props.onOpenApps}
        onOpenSkills={props.onOpenSkills}
        onOpenAutomations={props.onOpenAutomations}
        onOpenSettings={props.onOpenSettings}
        onDelete={props.onDeleteSession}
        onGetSessionAutomations={props.onGetSessionAutomations}
        onRename={props.onRenameSession}
        onRenameProject={props.onRenameProject}
        onSelect={props.onSelectSession}
        onSetShowArchived={props.onSetShowArchived}
        onToggleArchived={props.onToggleArchived}
        onToggleGroup={props.onToggleGroup}
        onTogglePinned={props.onTogglePinned}
        sessions={props.sessions}
        state={props.sidebarState}
        visible={props.drawerOpen}
      />
      {props.sessionSearchOpen ? (
        <SessionSearchModal
          activeKey={props.activeKey}
          colors={colors}
          loading={props.sessionsLoading}
          onClose={props.onCloseSessionSearch}
          onSelect={props.onSelectSession}
          sessions={props.sessions}
          titleOverrides={props.sidebarState.title_overrides}
          visible
        />
      ) : null}
      <PromptNavigator
        colors={colors}
        messages={props.messages}
        onClose={props.onClosePromptNavigator}
        onJumpToPrompt={props.onJumpToPrompt}
        visible={props.promptNavigatorOpen}
      />
      <SessionInfoModal
        colors={colors}
        loadJobs={props.onGetSessionAutomations}
        onClose={props.onCloseSessionInfo}
        sessionKey={props.activeKey}
        title={props.chatTitle}
        visible={props.sessionInfoOpen}
      />
      <AssistantQuoteModal
        colors={colors}
        content={props.assistantQuoteSource}
        onClose={props.onCloseAssistantQuote}
        onConfirm={props.onConfirmAssistantQuote}
      />
      <FilePreviewModal
        colors={colors}
        dark={dark}
        onClose={props.onCloseFilePreview}
        path={props.filePreviewPath}
        sessionKey={props.activeKey}
        token={props.token}
      />
    </>
  );
}
