import { AssistantQuoteModal } from '@/features/chat/components/modals/assistant-quote-modal';
import { FilePreviewModal } from '@/features/chat/components/modals/file-preview-modal';
import { SessionInfoModal } from '@/features/chat/components/modals/session-info-modal';
import { PromptNavigator } from '@/features/chat/components/widgets/prompt-navigator';
import type { SessionAutomationJob } from '@/types/api/automations';
import type { UIMessage } from '@/types/api/chat';
import type { Palette } from '@/ui/palette';

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
        onClose={props.onCloseAssistantQuote}
        onConfirm={props.onConfirmAssistantQuote}
        content={props.assistantQuoteSource}
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
