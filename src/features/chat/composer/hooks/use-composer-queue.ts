import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  SendAttachment,
  SendMessageOptions,
} from '@/types/api/chat/commands';

import { createQueuedPrompt, removeQueuedPrompt } from '../model/queue';
import type { QueuedPrompt } from '../model/types';

interface UseComposerQueueOptions {
  onSendMessage: (
    content: string,
    attachments?: SendAttachment[],
    options?: SendMessageOptions,
  ) => Promise<void>;
  onStopTurn: () => void;
  turnActive: boolean;
}

export function useComposerQueue({
  onSendMessage,
  onStopTurn,
  turnActive,
}: UseComposerQueueOptions) {
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [sending, setSending] = useState(false);
  const queueCounterRef = useRef(0);
  const wasTurnActiveRef = useRef(turnActive);
  const skipNextFlushRef = useRef(false);
  const sendingRef = useRef(false);

  const send = useCallback(async (prompt: Omit<QueuedPrompt, 'id'>): Promise<boolean> => {
    if (sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    try {
      await onSendMessage(prompt.text, prompt.attachments, prompt.options);
      return true;
    } catch {
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [onSendMessage]);

  const enqueue = useCallback((prompt: Omit<QueuedPrompt, 'id'>) => {
    queueCounterRef.current += 1;
    const queued = createQueuedPrompt(prompt, queueCounterRef.current);
    setQueuedPrompts((current) => [...current, queued]);
  }, []);

  const clear = useCallback(() => {
    setQueuedPrompts([]);
    skipNextFlushRef.current = false;
  }, []);

  const stop = useCallback(() => {
    skipNextFlushRef.current = queuedPrompts.length > 0;
    setQueuedPrompts([]);
    onStopTurn();
  }, [onStopTurn, queuedPrompts.length]);

  useEffect(() => {
    const wasTurnActive = wasTurnActiveRef.current;
    wasTurnActiveRef.current = turnActive;
    if (!wasTurnActive || turnActive) return;
    if (skipNextFlushRef.current) {
      skipNextFlushRef.current = false;
      return;
    }
    if (queuedPrompts.length === 0 || sendingRef.current) return;
    const next = queuedPrompts[0];
    const timer = setTimeout(() => {
      setQueuedPrompts((current) => removeQueuedPrompt(current, next.id));
      void send(next).then((sent) => {
        if (!sent) setQueuedPrompts((current) => [next, ...current]);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [queuedPrompts, send, turnActive]);

  return {
    clear,
    enqueue,
    queuedPrompts,
    remove(id: string) {
      setQueuedPrompts((current) => removeQueuedPrompt(current, id));
    },
    replace(prompts: QueuedPrompt[]) {
      setQueuedPrompts(prompts);
    },
    send,
    sending,
    sendingRef,
    stop,
  };
}
