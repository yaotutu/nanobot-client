import { useCallback, useState } from 'react';

export function useChatLocalState() {
  const [assistantQuoteSource, setAssistantQuoteSource] = useState<string | null>(null);
  const [promptNavigatorOpen, setPromptNavigatorOpen] = useState(false);
  const [filePreviewPath, setFilePreviewPath] = useState<string | null>(null);
  const [agentActivitySheetOpen, setAgentActivitySheetOpen] = useState(false);

  const resetForSessionChange = useCallback(() => {
    setPromptNavigatorOpen(false);
    setAssistantQuoteSource(null);
    setFilePreviewPath(null);
    setAgentActivitySheetOpen(false);
  }, []);

  return {
    assistantQuoteSource,
    promptNavigatorOpen,
    filePreviewPath,
    agentActivitySheetOpen,
    setAssistantQuoteSource,
    setPromptNavigatorOpen,
    setFilePreviewPath,
    setAgentActivitySheetOpen,
    resetForSessionChange,
  };
}
