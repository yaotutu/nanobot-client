import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { activeCapabilityMentionPayloads } from '@/features/chat/composer/model/capability-mentions';
import { useComposerDraft } from '@/features/chat/composer/hooks/use-composer-draft';
import { useComposerQueue } from '@/features/chat/composer/hooks/use-composer-queue';
import { useComposerSuggestions } from '@/features/chat/composer/hooks/use-composer-suggestions';
import { useAttachments } from '@/features/chat/hooks/use-attachments';
import {
  type VoiceRecorderError,
  useVoiceRecorder,
} from '@/features/chat/hooks/use-voice-recorder';
import {
  isSideChannelLifecycle,
  slashCommandLifecycle,
} from '@/features/chat/composer/model/slash-command';
import {
  formatQuotedUserMessage,
  normalizeQuotedContext,
} from '@/services/text/user-quote-format';
import type { CliAppInfo, McpPresetInfo, SkillSummary } from '@/types/api/capabilities';
import type {
  SendAttachment,
  SendMessageOptions,
  SlashCommand,
} from '@/types/api/chat';
import type { WebUIIngressLimits } from '@/types/api/runtime';
import type { SettingsPayload } from '@/types/api/settings';

export type {
  ComposerSlashCommand,
  QueuedPrompt,
} from '@/features/chat/composer/model/types';

interface UseComposerControllerOptions {
  cliApps: CliAppInfo[];
  limits?: WebUIIngressLimits;
  mcpPresets: McpPresetInfo[];
  onSendMessage: (
    content: string,
    attachments?: SendAttachment[],
    options?: SendMessageOptions,
  ) => Promise<void>;
  onStopTurn: () => void;
  onTranscribeAudio: (
    dataUrl: string,
    options?: { durationMs?: number },
  ) => Promise<string>;
  settings: SettingsPayload | null;
  skills: SkillSummary[];
  slashCommands: SlashCommand[];
  turnActive: boolean;
}

export function useComposerController(options: UseComposerControllerOptions) {
  const {
    cliApps,
    limits,
    mcpPresets,
    onSendMessage,
    onStopTurn,
    onTranscribeAudio,
    settings,
    skills,
    slashCommands,
    turnActive,
  } = options;
  const { t } = useTranslation();
  const draft = useComposerDraft();
  const attachments = useAttachments(limits);
  const queue = useComposerQueue({ onSendMessage, onStopTurn, turnActive });
  const [voiceError, setVoiceError] = useState<VoiceRecorderError | null>(null);

  const voiceRecorder = useVoiceRecorder({
    disabled: queue.sending || turnActive,
    maxDurationSec: settings?.transcription?.max_duration_sec,
    maxUploadMb: settings?.transcription?.max_upload_mb,
    onClearError: () => setVoiceError(null),
    onError: setVoiceError,
    onTranscript: draft.appendTranscript,
    onTranscribeAudio,
  });

  const suggestions = useComposerSuggestions({
    cliApps,
    clearDraft: draft.clear,
    cursor: draft.cursor,
    focusAt: draft.focusAt,
    handleStop: queue.stop,
    mcpPresets,
    mentionMenuDismissed: draft.mentionMenuDismissed,
    setCursor: draft.setCursor,
    setMentionMenuDismissed: draft.setMentionMenuDismissed,
    setSlashMenuDismissed: draft.setSlashMenuDismissed,
    setText: draft.setText,
    skills,
    slashCommands,
    slashMenuDismissed: draft.slashMenuDismissed,
    text: draft.text,
    turnActive,
  });

  const submit = useCallback(async () => {
    const content = draft.text.trim();
    const outboundContent = formatQuotedUserMessage(content, draft.quotedContext);
    const readyAttachments = attachments.readyAttachments;
    const capabilityPayloads = activeCapabilityMentionPayloads(
      content,
      cliApps,
      mcpPresets,
    );
    const messageOptions: SendMessageOptions = {
      ...(capabilityPayloads.cliApps.length
        ? { cliApps: capabilityPayloads.cliApps }
        : {}),
      ...(capabilityPayloads.mcpPresets.length
        ? { mcpPresets: capabilityPayloads.mcpPresets }
        : {}),
      ...(draft.quotedContext?.trim()
        ? { quotedContext: normalizeQuotedContext(draft.quotedContext) }
        : {}),
    };
    if (
      (!outboundContent && readyAttachments.length === 0)
      || attachments.encoding
      || attachments.hasErrors
      || queue.sendingRef.current
    ) return;

    const hasPlainTextCommandPayload = readyAttachments.length === 0
      && capabilityPayloads.cliApps.length === 0
      && capabilityPayloads.mcpPresets.length === 0;
    const slashLifecycle = hasPlainTextCommandPayload
      ? slashCommandLifecycle(content, slashCommands)
      : null;
    if (slashLifecycle === 'stop_active_turn' && turnActive) {
      draft.clear();
      queue.stop();
      return;
    }

    const sideChannel = isSideChannelLifecycle(slashLifecycle);
    if (turnActive && !sideChannel && !content.trimStart().startsWith('/')) {
      queue.enqueue({
        text: content,
        attachments: readyAttachments,
        options: messageOptions,
      });
      draft.clear();
      attachments.clear();
      return;
    }

    const sendOptions: SendMessageOptions = {
      ...messageOptions,
      ...(sideChannel ? { sideChannel: true } : {}),
      ...(slashLifecycle === 'finalize_active_turn'
        ? { finalizeActiveTurn: true }
        : {}),
    };
    const pendingQuote = draft.quotedContext;
    draft.clear();
    queue.replace([]);
    const sent = await queue.send({
      text: content,
      attachments: readyAttachments,
      options: sendOptions,
    });
    if (sent) attachments.clear();
    else draft.restore(content, pendingQuote);
  }, [
    attachments,
    cliApps,
    draft,
    mcpPresets,
    queue,
    slashCommands,
    turnActive,
  ]);

  const openAttachmentMenu = useCallback(() => {
    Alert.alert(t('thread.composer.attachImage'), t('thread.composer.attachImage'), [
      { text: t('settings.actions.cancel'), style: 'cancel' },
      { text: t('settings.nav.image'), onPress: () => void attachments.pickImages() },
      { text: t('message.fileEditOpenFile'), onPress: () => void attachments.pickDocuments() },
    ]);
  }, [attachments, t]);

  const clearAttachments = attachments.clear;
  const clearDraft = draft.clear;
  const clearQueue = queue.clear;
  const reset = useCallback(() => {
    clearDraft();
    clearQueue();
    clearAttachments();
  }, [clearAttachments, clearDraft, clearQueue]);

  return {
    attachments,
    clearQueue: queue.clear,
    confirmQuote: draft.confirmQuote,
    handleStop: queue.stop,
    inputRef: draft.inputRef,
    onChangeText: draft.onChangeText,
    onCursorChange: draft.onCursorChange,
    openAttachmentMenu,
    queuedPrompts: queue.queuedPrompts,
    removeQueuedPrompt: queue.remove,
    reset,
    selectMentionCandidate: suggestions.selectMentionCandidate,
    selectSkillCandidate: suggestions.selectSkillCandidate,
    selectSlashCommand: suggestions.selectSlashCommand,
    sending: queue.sending,
    setQuotedContext: draft.setQuotedContext,
    submit,
    text: draft.text,
    quotedContext: draft.quotedContext,
    visibleMentionCandidates: suggestions.visibleMentionCandidates,
    visibleSkillCandidates: suggestions.visibleSkillCandidates,
    visibleSlashCommands: suggestions.visibleSlashCommands,
    voiceError,
    voiceRecorder,
  };
}

export type ComposerController = ReturnType<typeof useComposerController>;
