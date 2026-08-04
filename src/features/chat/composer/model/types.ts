import type {
  SendAttachment,
  SendMessageOptions,
  SlashCommand,
} from '@/types/api/chat/commands';

export interface QueuedPrompt {
  id: string;
  text: string;
  attachments: SendAttachment[];
  options?: SendMessageOptions;
}

export interface ComposerSlashCommand extends SlashCommand {
  recent: boolean;
}
