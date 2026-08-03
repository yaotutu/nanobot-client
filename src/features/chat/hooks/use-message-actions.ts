import { useCallback, useState } from 'react';

interface UseMessageActionsOptions {
  clearComposerQueue: () => void;
  forkFromMessage: (beforeUserIndex: number) => Promise<unknown>;
  retryFromMessage: (messageId: string) => Promise<void>;
  turnActive: boolean;
}

export function useMessageActions({
  clearComposerQueue,
  forkFromMessage,
  retryFromMessage,
  turnActive,
}: UseMessageActionsOptions) {
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);

  const retry = useCallback((messageId: string) => async () => {
    if (turnActive || retryingMessageId) return;
    setRetryingMessageId(messageId);
    try {
      await retryFromMessage(messageId);
    } finally {
      setRetryingMessageId(null);
    }
  }, [retryFromMessage, retryingMessageId, turnActive]);

  const fork = useCallback(async (messageId: string, beforeUserIndex: number) => {
    if (forkingMessageId) return;
    clearComposerQueue();
    setForkingMessageId(messageId);
    try {
      await forkFromMessage(beforeUserIndex);
    } catch {
      // The app controller exposes the server error in the persistent banner.
    } finally {
      setForkingMessageId(null);
    }
  }, [clearComposerQueue, forkFromMessage, forkingMessageId]);

  return {
    forkFromMessage: fork,
    forkingMessageId,
    retryFromMessage: retry,
    retryingMessageId,
  };
}
