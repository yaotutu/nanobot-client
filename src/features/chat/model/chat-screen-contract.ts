import type { SessionAutomationJob } from '@/types/api/automations';
import type {
  CliAppInfo,
  McpPresetInfo,
  SkillSummary,
} from '@/types/api/capabilities';
import type {
  SendAttachment,
  SendMessageOptions,
  SlashCommand,
} from '@/types/api/chat/commands';
import type { StreamError } from '@/types/api/chat/errors';
import type { UIMessage } from '@/types/api/chat/messages';
import type { BootstrapResponse, ConnectionStatus, GoalStateWsPayload } from '@/types/api/runtime';
import type { ModelPresetInfo, SettingsPayload } from '@/types/api/settings';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';
import type {
  WorkspaceScopePayload,
  WorkspacesPayload,
} from '@/types/api/workspaces';

export interface ChatScreenController {
  session: {
    activeKey: string | null;
    activeSession: ChatSummary | null;
    sidebarState: SidebarStatePayload;
  };
  capabilities: {
    bootstrap: BootstrapResponse;
    cliApps: CliAppInfo[];
    mcpPresets: McpPresetInfo[];
    skills: SkillSummary[];
    slashCommands: SlashCommand[];
  };
  thread: {
    messages: UIMessage[];
    loading: boolean;
    loadingOlder: boolean;
    hasMoreBefore: boolean;
    userMessageOffset: number;
    forkBoundaryMessageCount: number | null;
    loadOlder: () => Promise<void>;
    retryFromMessage: (messageId: string) => Promise<void>;
    forkFromMessage: (beforeUserIndex: number) => Promise<string | undefined>;
  };
  runtime: {
    connectionStatus: ConnectionStatus;
    connectionSyncing: boolean;
    networkAvailable: boolean;
    reconnect: () => Promise<void>;
    turnActive: boolean;
    runStartedAt: number | null;
    goalState: GoalStateWsPayload | undefined;
    sendMessage: (
      content: string,
      attachments?: SendAttachment[],
      options?: SendMessageOptions,
    ) => Promise<void>;
    stopTurn: () => void;
    transcribeAudio: (
      dataUrl: string,
      options?: { durationMs?: number },
    ) => Promise<string>;
  };
  workspace: {
    activeScope: WorkspaceScopePayload | null;
    catalog: WorkspacesPayload | null;
    error: string | null;
    updateScope: (scope: WorkspaceScopePayload) => void;
  };
  errors: {
    current: string | null;
    stream: StreamError | null;
    clear: () => void;
    dismissStream: () => void;
  };
  automations: {
    getForSession: (key: string) => Promise<SessionAutomationJob[]>;
  };
}

export interface ChatModelSelection {
  activeModelPreset: string;
  changeModelPreset: (name: string) => Promise<void>;
  modelDisplayLabel: string;
  orderedModelPresets: ModelPresetInfo[];
  settings: SettingsPayload | null;
}
