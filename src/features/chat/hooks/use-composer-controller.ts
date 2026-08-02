import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, type TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  activeCapabilityMentionPayloads,
  capabilityMentionCandidates,
  capabilityMentionQuery,
  insertCapabilityMention,
  type CapabilityMentionCandidate,
} from '@/features/chat/capability-mentions';
import {
  insertSkillMention,
  skillMentionCandidates,
  skillMentionQuery,
  type SkillMentionCandidate,
} from '@/features/chat/skill-mentions';
import {
  isSideChannelLifecycle,
  slashCommandLifecycle,
  slashQuery,
} from '@/features/chat/slash-command';
import { useAttachments } from '@/hooks/use-attachments';
import {
  type VoiceRecorderError,
  useVoiceRecorder,
} from '@/hooks/use-voice-recorder';
import {
  readComposerRecents,
  writeComposerRecents,
} from '@/stores/composer-recents-store';
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

export interface QueuedPrompt {
  id: string;
  text: string;
  attachments: SendAttachment[];
  options?: SendMessageOptions;
}

export interface ComposerSlashCommand extends SlashCommand {
  recent: boolean;
}

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
  const [text, setText] = useState('');
  const [quotedContext, setQuotedContext] = useState<string | null>(null);
  const [slashMenuDismissed, setSlashMenuDismissed] = useState(false);
  const [mentionMenuDismissed, setMentionMenuDismissed] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [voiceError, setVoiceError] = useState<VoiceRecorderError | null>(null);
  const attachments = useAttachments(limits);
  const inputRef = useRef<TextInput>(null);
  const queueCounterRef = useRef(0);
  const wasTurnActiveRef = useRef(turnActive);
  const skipNextQueueFlushRef = useRef(false);
  const sendingRef = useRef(false);

  const focusAt = useCallback((nextCursor: number) => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps({
        selection: { start: nextCursor, end: nextCursor },
      });
    }, 0);
  }, []);

  const voiceRecorder = useVoiceRecorder({
    disabled: sending || turnActive,
    maxDurationSec: settings?.transcription?.max_duration_sec,
    maxUploadMb: settings?.transcription?.max_upload_mb,
    onClearError: () => setVoiceError(null),
    onError: setVoiceError,
    onTranscript: (transcript) => {
      setText((current) => {
        if (!current) return transcript;
        return `${current}${/\s$/.test(current) ? '' : ' '}${transcript}`;
      });
      inputRef.current?.focus();
    },
    onTranscribeAudio,
  });

  useEffect(() => {
    let cancelled = false;
    void readComposerRecents().then((stored) => {
      if (!cancelled) setRecentCommands(stored);
    });
    return () => { cancelled = true; };
  }, []);

  const currentSlashQuery = slashMenuDismissed ? null : slashQuery(text);
  const visibleSlashCommands = useMemo(() => {
    if (currentSlashQuery === null) return [];
    const query = currentSlashQuery.trim().toLowerCase();
    return slashCommands
      .filter((command) => {
        if (!query && command.command === '/restart') return false;
        if (!query && !turnActive && command.command === '/stop') return false;
        if (!query) return true;
        return [command.command, command.title, command.description, command.argHint]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        if (turnActive) {
          if (left.command === '/stop') return -1;
          if (right.command === '/stop') return 1;
        }
        if (query) return 0;
        const leftRecent = recentCommands.indexOf(left.command);
        const rightRecent = recentCommands.indexOf(right.command);
        if (leftRecent === -1 && rightRecent === -1) return 0;
        if (leftRecent === -1) return 1;
        if (rightRecent === -1) return -1;
        return leftRecent - rightRecent;
      })
      .slice(0, 8)
      .map((command): ComposerSlashCommand => ({
        ...command,
        recent: recentCommands.includes(command.command),
      }));
  }, [currentSlashQuery, recentCommands, slashCommands, turnActive]);
  const currentSkillQuery = slashMenuDismissed ? null : skillMentionQuery(text, cursor);
  const visibleSkillCandidates = useMemo(
    () => skillMentionCandidates(currentSkillQuery, skills, recentCommands),
    [currentSkillQuery, recentCommands, skills],
  );
  const currentMentionQuery = mentionMenuDismissed
    ? null
    : capabilityMentionQuery(text, cursor);
  const visibleMentionCandidates = useMemo(
    () => capabilityMentionCandidates(currentMentionQuery, cliApps, mcpPresets),
    [cliApps, currentMentionQuery, mcpPresets],
  );

  const clearDraft = useCallback(() => {
    setText('');
    setQuotedContext(null);
    setSlashMenuDismissed(false);
    setMentionMenuDismissed(false);
    setCursor(0);
  }, []);

  const handleStop = useCallback(() => {
    skipNextQueueFlushRef.current = queuedPrompts.length > 0;
    setQueuedPrompts([]);
    onStopTurn();
  }, [onStopTurn, queuedPrompts.length]);

  useEffect(() => {
    const wasTurnActive = wasTurnActiveRef.current;
    wasTurnActiveRef.current = turnActive;
    if (!wasTurnActive || turnActive) return;
    if (skipNextQueueFlushRef.current) {
      skipNextQueueFlushRef.current = false;
      return;
    }
    if (queuedPrompts.length === 0 || sendingRef.current) return;
    const next = queuedPrompts[0];
    const timer = setTimeout(() => {
      setQueuedPrompts((current) => current.filter((prompt) => prompt.id !== next.id));
      sendingRef.current = true;
      setSending(true);
      void onSendMessage(next.text, next.attachments, next.options)
        .catch(() => {
          setQueuedPrompts((current) => [next, ...current]);
        })
        .finally(() => {
          sendingRef.current = false;
          setSending(false);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [onSendMessage, queuedPrompts, turnActive]);

  const recordRecent = useCallback((command: string) => {
    setRecentCommands((current) => {
      const next = [command, ...current.filter((item) => item !== command)].slice(0, 5);
      void writeComposerRecents(next);
      return next;
    });
  }, []);

  const selectSlashCommand = useCallback((command: ComposerSlashCommand) => {
    if (command.command === '/stop' && turnActive) {
      handleStop();
      clearDraft();
      setSlashMenuDismissed(true);
      return;
    }
    recordRecent(command.command);
    const nextValue = command.acceptsArgs ? `${command.command} ` : command.command;
    setText(nextValue);
    setSlashMenuDismissed(true);
    setMentionMenuDismissed(false);
    setCursor(nextValue.length);
    focusAt(nextValue.length);
  }, [clearDraft, focusAt, handleStop, recordRecent, turnActive]);

  const selectSkillCandidate = useCallback((candidate: SkillMentionCandidate) => {
    if (!currentSkillQuery) return;
    recordRecent(candidate.command);
    const next = insertSkillMention(text, currentSkillQuery, candidate);
    setText(next.value);
    setCursor(next.cursor);
    setSlashMenuDismissed(true);
    setMentionMenuDismissed(false);
    focusAt(next.cursor);
  }, [currentSkillQuery, focusAt, recordRecent, text]);

  const selectMentionCandidate = useCallback((candidate: CapabilityMentionCandidate) => {
    if (!currentMentionQuery) return;
    const next = insertCapabilityMention(text, currentMentionQuery, candidate);
    setText(next.value);
    setCursor(next.cursor);
    setMentionMenuDismissed(true);
    setSlashMenuDismissed(false);
    focusAt(next.cursor);
  }, [currentMentionQuery, focusAt, text]);

  const submit = useCallback(async () => {
    const content = text.trim();
    const outboundContent = formatQuotedUserMessage(content, quotedContext);
    const readyAttachments = attachments.readyAttachments;
    const capabilityPayloads = activeCapabilityMentionPayloads(content, cliApps, mcpPresets);
    const messageOptions: SendMessageOptions = {
      ...(capabilityPayloads.cliApps.length ? { cliApps: capabilityPayloads.cliApps } : {}),
      ...(capabilityPayloads.mcpPresets.length ? { mcpPresets: capabilityPayloads.mcpPresets } : {}),
      ...(quotedContext?.trim()
        ? { quotedContext: normalizeQuotedContext(quotedContext) }
        : {}),
    };
    if (
      (!outboundContent && readyAttachments.length === 0)
      || attachments.encoding
      || attachments.hasErrors
      || sendingRef.current
    ) return;

    const hasPlainTextCommandPayload = readyAttachments.length === 0
      && capabilityPayloads.cliApps.length === 0
      && capabilityPayloads.mcpPresets.length === 0;
    const slashLifecycle = hasPlainTextCommandPayload
      ? slashCommandLifecycle(content, slashCommands)
      : null;
    if (slashLifecycle === 'stop_active_turn' && turnActive) {
      clearDraft();
      handleStop();
      return;
    }

    const sideChannel = isSideChannelLifecycle(slashLifecycle);
    if (turnActive && !sideChannel && !content.trimStart().startsWith('/')) {
      queueCounterRef.current += 1;
      setQueuedPrompts((current) => [...current, {
        id: `queued-prompt-${Date.now()}-${queueCounterRef.current}`,
        text: content,
        attachments: [...readyAttachments],
        options: messageOptions,
      }]);
      clearDraft();
      attachments.clear();
      return;
    }

    const sendOptions: SendMessageOptions = {
      ...messageOptions,
      ...(sideChannel ? { sideChannel: true } : {}),
      ...(slashLifecycle === 'finalize_active_turn' ? { finalizeActiveTurn: true } : {}),
    };
    const pendingQuote = quotedContext;
    clearDraft();
    setQueuedPrompts([]);
    sendingRef.current = true;
    setSending(true);
    try {
      await onSendMessage(content, readyAttachments, sendOptions);
      attachments.clear();
    } catch {
      setText(content);
      setQuotedContext(pendingQuote);
      setSlashMenuDismissed(false);
      setMentionMenuDismissed(false);
      setCursor(content.length);
      focusAt(content.length);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [
    attachments,
    clearDraft,
    cliApps,
    focusAt,
    handleStop,
    mcpPresets,
    onSendMessage,
    quotedContext,
    slashCommands,
    text,
    turnActive,
  ]);

  const openAttachmentMenu = useCallback(() => {
    Alert.alert(t('thread.composer.attachImage'), t('thread.composer.attachImage'), [
      { text: t('settings.actions.cancel'), style: 'cancel' },
      { text: t('settings.nav.image'), onPress: () => void attachments.pickImages() },
      { text: t('message.fileEditOpenFile'), onPress: () => void attachments.pickDocuments() },
    ]);
  }, [attachments, t]);

  const clearQueue = useCallback(() => {
    setQueuedPrompts([]);
    skipNextQueueFlushRef.current = false;
  }, []);

  const reset = useCallback(() => {
    clearDraft();
    clearQueue();
    attachments.clear();
  }, [attachments, clearDraft, clearQueue]);

  const confirmQuote = useCallback((content: string) => {
    setQuotedContext(normalizeQuotedContext(content));
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  return {
    attachments,
    clearQueue,
    confirmQuote,
    handleStop,
    inputRef,
    onChangeText: (value: string) => {
      setText(value);
      setSlashMenuDismissed(false);
      setMentionMenuDismissed(false);
    },
    onCursorChange: (nextCursor: number) => {
      setCursor(nextCursor);
      setSlashMenuDismissed(false);
      setMentionMenuDismissed(false);
    },
    openAttachmentMenu,
    queuedPrompts,
    removeQueuedPrompt: (id: string) => {
      setQueuedPrompts((current) => current.filter((prompt) => prompt.id !== id));
    },
    reset,
    selectMentionCandidate,
    selectSkillCandidate,
    selectSlashCommand,
    sending,
    setQuotedContext,
    submit,
    text,
    quotedContext,
    visibleMentionCandidates,
    visibleSkillCandidates,
    visibleSlashCommands,
    voiceError,
    voiceRecorder,
  };
}
