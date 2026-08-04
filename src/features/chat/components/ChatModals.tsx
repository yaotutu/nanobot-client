import { createDeferredComponent } from '@/hooks/use-deferred-component';
import type { SessionAutomationJob } from '@/types/api/automations';
import type { UIMessage } from '@/types/api/chat/messages';
import type { Palette } from '@/ui/palette';

/**
 * 聊天弹窗包含文件读取、代码高亮和自动化详情等重依赖。仅在对应弹窗真正打开时加载。
 * 显式异步 loader 不依赖 Suspense，避免旧 Android Fabric 的 MountingCoordinator 崩溃。
 */
const DeferredAssistantQuoteModal = createDeferredComponent(() => import(
  '@/features/chat/components/modals/assistant-quote-modal'
).then(({ AssistantQuoteModal }) => AssistantQuoteModal));
const DeferredFilePreviewModal = createDeferredComponent(() => import(
  '@/features/chat/components/modals/file-preview-modal'
).then(({ FilePreviewModal }) => FilePreviewModal));
const DeferredSessionInfoModal = createDeferredComponent(() => import(
  '@/features/chat/components/modals/session-info-modal'
).then(({ SessionInfoModal }) => SessionInfoModal));
const DeferredPromptNavigator = createDeferredComponent(() => import(
  '@/features/chat/components/widgets/prompt-navigator'
).then(({ PromptNavigator }) => PromptNavigator));

export interface ChatModalsProps {
  colors: Palette;
  dark: boolean;
  activeKey: string | null;
  chatTitle: string;
  messages: UIMessage[];
  promptNavigatorOpen: boolean;
  sessionInfoOpen: boolean;
  assistantQuoteSource: string | null;
  filePreviewPath: string | null;
  token: string;
  onClosePromptNavigator: () => void;
  onCloseSessionInfo: () => void;
  onCloseAssistantQuote: () => void;
  onCloseFilePreview: () => void;
  onConfirmAssistantQuote: (content: string) => void;
  onJumpToPrompt: (messageId: string) => void;
  onGetSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
}

export function ChatModals(props: ChatModalsProps) {
  const { colors, dark } = props;

  return (
    <>
      {props.promptNavigatorOpen ? (
        <DeferredPromptNavigator
          componentProps={{
            colors,
            messages: props.messages,
            onClose: props.onClosePromptNavigator,
            onJumpToPrompt: props.onJumpToPrompt,
            visible: true,
          }}
          enabled
        />
      ) : null}
      {props.sessionInfoOpen ? (
        <DeferredSessionInfoModal
          componentProps={{
            colors,
            loadJobs: props.onGetSessionAutomations,
            onClose: props.onCloseSessionInfo,
            sessionKey: props.activeKey,
            title: props.chatTitle,
            visible: true,
          }}
          enabled
        />
      ) : null}
      {props.assistantQuoteSource !== null ? (
        <DeferredAssistantQuoteModal
          componentProps={{
            colors,
            onClose: props.onCloseAssistantQuote,
            onConfirm: props.onConfirmAssistantQuote,
            content: props.assistantQuoteSource,
          }}
          enabled
        />
      ) : null}
      {props.filePreviewPath !== null ? (
        <DeferredFilePreviewModal
          componentProps={{
            colors,
            dark,
            onClose: props.onCloseFilePreview,
            path: props.filePreviewPath,
            sessionKey: props.activeKey,
            token: props.token,
          }}
          enabled
        />
      ) : null}
    </>
  );
}
