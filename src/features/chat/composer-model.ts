import type { TFunction } from 'i18next';

import type { QueuedPrompt } from '@/features/chat/hooks/use-composer-controller';
import { parseQuotedUserMessage } from '@/services/text/user-quote-format';

export function queuedPromptPreview(prompt: QueuedPrompt, t: TFunction): string {
  const parsed = parseQuotedUserMessage(prompt.text);
  if (parsed.content.trim()) return parsed.content;
  if (parsed.quotedContext || prompt.options?.quotedContext?.trim()) return t('thread.composer.quotedContext');
  return prompt.attachments.length
    ? `${prompt.attachments.length} · ${t('thread.composer.attachImage')}`
    : t('thread.composer.queued.guide');
}

export function formatAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
