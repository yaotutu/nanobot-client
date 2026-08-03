import type { QueuedPrompt } from './types';

export interface QueuedPromptInput extends Omit<QueuedPrompt, 'id'> {
  id?: string;
}

export function createQueuedPrompt(
  input: QueuedPromptInput,
  sequence: number,
  now = Date.now(),
): QueuedPrompt {
  return {
    ...input,
    id: input.id ?? `queued-prompt-${now}-${sequence}`,
    attachments: [...input.attachments],
  };
}

export function removeQueuedPrompt(
  prompts: QueuedPrompt[],
  id: string,
): QueuedPrompt[] {
  return prompts.filter((prompt) => prompt.id !== id);
}
