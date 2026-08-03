import { useCallback, useState } from 'react';

export function useChatLocalState() {
  const [assistantQuoteSource, setAssistantQuoteSource] = useState<string | null>(null);
  const [promptNavigatorOpen, setPromptNavigatorOpen] = useState(false);
  const [sessionInfoOpen, setSessionInfoOpen] = useState(false);
  const [filePreviewPath, setFilePreviewPath] = useState<string | null>(null);

  const resetForSessionChange = useCallback(() => {
    setPromptNavigatorOpen(false);
    setSessionInfoOpen(false);
    setAssistantQuoteSource(null);
    setFilePreviewPath(null);
  }, []);

  return {
    assistantQuoteSource,
    promptNavigatorOpen,
    sessionInfoOpen,
    filePreviewPath,
    setAssistantQuoteSource,
    setPromptNavigatorOpen,
    setSessionInfoOpen,
    setFilePreviewPath,
    resetForSessionChange,
  };
}
