import type { RefObject } from 'react';
import type { TextInput } from 'react-native';

import type { CapabilityMentionCandidate } from '@/features/chat/composer/model/capability-mentions';
import type { ComposerSlashCommand, QueuedPrompt } from '@/features/chat/hooks/use-composer-controller';
import type { SkillMentionCandidate } from '@/features/chat/composer/model/skill-mentions';
import type { ComposerAttachment } from '@/types/api/chat/attachments';
import type { GoalStateWsPayload } from '@/types/api/runtime';
import type { Palette } from '@/ui/palette';

export interface ComposerAppearance {
  colors: Palette;
  dark: boolean;
}

export interface ComposerDraft {
  quotedContext: string | null;
  value: string;
  onChangeText: (value: string) => void;
  onClearQuote: () => void;
  onCursorChange: (cursor: number) => void;
}

export interface ComposerAttachments {
  items: ComposerAttachment[];
  busy: boolean;
  error: string | null;
  full: boolean;
  readyCount: number;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export interface ComposerSuggestionsState {
  mentionCandidates: CapabilityMentionCandidate[];
  skillCandidates: SkillMentionCandidate[];
  slashCommands: ComposerSlashCommand[];
  onMentionSelect: (candidate: CapabilityMentionCandidate) => void;
  onSkillSelect: (candidate: SkillMentionCandidate) => void;
  onSlashCommandSelect: (command: ComposerSlashCommand) => void;
}

export interface ComposerRuntimeState {
  disabled: boolean;
  goalState?: GoalStateWsPayload;
  queuedPrompts: QueuedPrompt[];
  runStartedAt: number | null;
  turnActive: boolean;
  onRemoveQueuedPrompt: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
}

// 输入区只接收草稿、附件、建议和运行状态；模型／工作区选项由独立弹窗负责。
export interface ComposerProps {
  inputRef: RefObject<TextInput | null>;
  appearance: ComposerAppearance;
  attachments: ComposerAttachments;
  draft: ComposerDraft;
  runtime: ComposerRuntimeState;
  suggestions: ComposerSuggestionsState;
}
