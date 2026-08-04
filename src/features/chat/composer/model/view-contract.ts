import type { RefObject } from 'react';
import type { TextInput } from 'react-native';

import type { CapabilityMentionCandidate } from '@/features/chat/composer/model/capability-mentions';
import type { ComposerSlashCommand, QueuedPrompt } from '@/features/chat/hooks/use-composer-controller';
import type { SkillMentionCandidate } from '@/features/chat/composer/model/skill-mentions';
import type { VoiceRecorderController } from '@/features/chat/hooks/use-voice-recorder';
import type { ComposerAttachment } from '@/types/api/chat/attachments';
import type { GoalStateWsPayload } from '@/types/api/runtime';
import type { SettingsPayload } from '@/types/api/settings';
import type {
  WorkspaceScopePayload,
  WorkspacesPayload,
} from '@/types/api/workspaces';
import type { Palette } from '@/ui/palette';

export interface ComposerAppearance {
  colors: Palette;
  dark: boolean;
  variant: 'hero' | 'thread';
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

export interface ComposerModelState {
  activePreset: string;
  displayName: string;
  presets: SettingsPayload['model_presets'];
  onChange: (name: string) => Promise<void>;
  onOpenSettings: () => void;
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

export interface ComposerVoiceState {
  error: string | null;
  recorder: VoiceRecorderController;
}

export interface ComposerWorkspaceState {
  controls: WorkspacesPayload['controls'] | null;
  defaultScope: WorkspaceScopePayload | null;
  disabled: boolean;
  error: string | null;
  scope: WorkspaceScopePayload | null;
  onChange: (scope: WorkspaceScopePayload) => void;
}

export interface ComposerProps {
  inputRef: RefObject<TextInput | null>;
  appearance: ComposerAppearance;
  attachments: ComposerAttachments;
  draft: ComposerDraft;
  model: ComposerModelState;
  runtime: ComposerRuntimeState;
  suggestions: ComposerSuggestionsState;
  voice: ComposerVoiceState;
  workspace: ComposerWorkspaceState;
}
