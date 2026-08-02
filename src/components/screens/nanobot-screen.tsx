import { X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { setAppLanguage } from '@/i18n';
import { normalizeLocale } from '@/i18n/config';

import { useAttachments } from '@/hooks/use-attachments';
import {
  type VoiceRecorderError,
  useVoiceRecorder,
} from '@/hooks/use-voice-recorder';
import { ApiError } from '@/services/api/api';
import { fetchFilePreviewAvailability } from '@/features/chat/api';
import { fetchSettings } from '@/features/settings/api';
import {
  normalizeActivityTimeline,
  type TurnUnit,
} from '@/features/chat/activity-timeline';
import {
  assistantForkIndexes,
  currentActivityClusterIndices,
  unitIndexAfterMessageCount,
  unitKeysForDisplay,
} from "@/features/chat/components/timeline";
import { useChatScroll } from "@/features/chat/hooks/useChatScroll";
import { ChatThread } from "@/features/chat/components/ChatThread";
import { sessionTitle } from '@/services/text/format';
import {
  formatQuotedUserMessage,
  normalizeQuotedContext,
} from '@/services/text/user-quote-format';
import {
  activeCapabilityMentionPayloads,
  capabilityMentionCandidates,
  capabilityMentionQuery,
  insertCapabilityMention,
  type CapabilityMentionCandidate,
} from '@/features/chat/capability-mentions';
import {
  DEFAULT_LOCAL_PREFS,
  readLocalPreferences,
  writeLocalPreferences,
  type LocalPreferences,
} from '@/stores/local-preferences-store';
import {
  readComposerRecents,
  writeComposerRecents,
} from '@/stores/composer-recents-store';
import { Composer as ExtractedComposer } from "@/features/chat/components/Composer";
import { ChatHeader } from "@/features/chat/components/ChatHeader";
import { ChatModals } from "@/features/chat/components/ChatModals";
import { LIGHT_COLORS, DARK_COLORS } from '@/ui/colors';
import { resolveRuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import {
  isSideChannelLifecycle,
  slashCommandLifecycle,
  slashQuery,
} from '@/features/chat/slash-command';
import {
  insertSkillMention,
  skillMentionCandidates,
  skillMentionQuery,
  type SkillMentionCandidate,
} from '@/features/chat/skill-mentions';
import type {
  BootstrapResponse,
  ChatSummary,
  CliAppInfo,
  CliAppsPayload,
  ConnectionStatus,
  GoalStateWsPayload,
  McpPresetInfo,
  McpPresetsPayload,
  SidebarStatePayload,
  SendAttachment,
  SendMessageOptions,
  SessionAutomationJob,
  SessionDeleteResult,
  SettingsPayload,
  SlashCommand,
  SkillSummary,
  StreamError,
  UIMessage,
  WorkspaceScopePayload,
  WorkspacesPayload,
} from '@/types/api';

import { AutomationsScreen } from '../automations/AutomationsScreen';
import { AppsScreen } from '../apps/AppsScreen';
import { SkillsScreen } from '../skills-screen';
import { SettingsScreen } from './settings-screen';
import { StreamErrorNotice } from '../widgets/stream-error-notice';

interface NanobotScreenProps {
  bootstrap: BootstrapResponse;
  connectionStatus: ConnectionStatus;
  cliApps: CliAppInfo[];
  sessions: ChatSummary[];
  sidebarState: SidebarStatePayload;
  sessionsLoading: boolean;
  activeKey: string | null;
  activeSession: ChatSummary | null;
  messages: UIMessage[];
  mcpPresets: McpPresetInfo[];
  skills: SkillSummary[];
  threadLoading: boolean;
  loadingOlder: boolean;
  hasMoreBefore: boolean;
  userMessageOffset: number;
  forkBoundaryMessageCount: number | null;
  turnActive: boolean;
  runStartedAt: number | null;
  goalState?: GoalStateWsPayload;
  runtimeModelName: string | null;
  turnModelName: string | null;
  modelSettingsRevision: number;
  slashCommands: SlashCommand[];
  error: string | null;
  streamError: StreamError | null;
  workspaces: WorkspacesPayload | null;
  activeWorkspaceScope: WorkspaceScopePayload | null;
  workspaceError: string | null;
  onClearError: () => void;
  onDismissStreamError: () => void;
  onWorkspaceScopeChange: (scope: WorkspaceScopePayload) => void;
  onCliAppsChanged: (payload: CliAppsPayload) => void;
  onSelectSession: (key: string | null) => void;
  onStartNewChat: () => void;
  onStartNewChatInProject: (projectPath: string, projectName: string) => void;
  onLoadOlder: () => Promise<void>;
  onModelPresetChange: (name: string) => Promise<void>;
  onForkFromMessage: (beforeUserIndex: number) => Promise<string>;
  onRetryFromMessage: (messageId: string) => Promise<void> | void;
  onTogglePinned: (key: string) => Promise<void>;
  onToggleArchived: (key: string) => Promise<void>;
  onToggleSidebarGroup: (groupId: string) => Promise<void>;
  onRenameSession: (key: string, title: string) => Promise<void>;
  onRenameProject: (projectKey: string, title: string) => Promise<void>;
  onSetShowArchived: (show: boolean) => Promise<void>;
  onDeleteSession: (
    key: string,
    options?: { deleteAutomations?: boolean },
  ) => Promise<SessionDeleteResult>;
  onGetSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
  onSendMessage: (
    content: string,
    attachments?: SendAttachment[],
    options?: SendMessageOptions,
  ) => Promise<void>;
  onTranscribeAudio: (
    dataUrl: string,
    options?: { durationMs?: number },
  ) => Promise<string>;
  onStopTurn: () => void;
  onRestart: () => void;
  onLogout: () => void;
  onMcpPresetsChanged: (payload: McpPresetsPayload) => void;
}


interface QueuedPrompt {
  id: string;
  text: string;
  attachments: SendAttachment[];
  options?: SendMessageOptions;
}

interface ComposerSlashCommand extends SlashCommand {
  recent: boolean;
}

interface FilePreviewAvailabilityCacheEntry {
  available?: boolean;
  promise: Promise<boolean>;
  revision: number;
}

export function NanobotScreen(props: NanobotScreenProps) {
  const { hasMoreBefore, loadingOlder, onLoadOlder, onSendMessage, turnActive } = props;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [utilityView, setUtilityView] = useState<'chat' | 'apps' | 'skills' | 'automations' | 'settings'>('chat');
  const [preferences, setPreferences] = useState<LocalPreferences>(DEFAULT_LOCAL_PREFS);
  const [composerText, setComposerText] = useState('');
  const [quotedContext, setQuotedContext] = useState<string | null>(null);
  const [assistantQuoteSource, setAssistantQuoteSource] = useState<string | null>(null);
  const [promptNavigatorOpen, setPromptNavigatorOpen] = useState(false);
  const [sessionInfoOpen, setSessionInfoOpen] = useState(false);
  const [slashMenuDismissed, setSlashMenuDismissed] = useState(false);
  const [mentionMenuDismissed, setMentionMenuDismissed] = useState(false);
  const [composerCursor, setComposerCursor] = useState(0);
  const [recentComposerCommands, setRecentComposerCommands] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
  const [filePreviewPath, setFilePreviewPath] = useState<string | null>(null);
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [localModelSelection, setLocalModelSelection] = useState<{ scopeKey: string; preset: string } | null>(null);
  const [voiceError, setVoiceError] = useState<VoiceRecorderError | null>(null);
  const staged = useAttachments(props.bootstrap.limits);
  const composerInputRef = useRef<TextInput>(null);
  const queuedPromptCounterRef = useRef(0);
  const wasTurnActiveRef = useRef(turnActive);
  const skipNextQueueFlushRef = useRef(false);
  const greeting = t('thread.empty.greetings.workOn');
  const dark = preferences.theme === 'dark';
  const colors = dark ? DARK_COLORS : LIGHT_COLORS;
  const runtimePolicy = resolveRuntimeClientPolicy(settings, props.bootstrap);
  const voiceRecorder = useVoiceRecorder({
    disabled: sending || turnActive,
    maxDurationSec: settings?.transcription?.max_duration_sec,
    maxUploadMb: settings?.transcription?.max_upload_mb,
    onClearError: () => setVoiceError(null),
    onError: setVoiceError,
    onTranscript: (text) => {
      setComposerText((current) => {
        if (!current) return text;
        return `${current}${/\s$/.test(current) ? '' : ' '}${text}`;
      });
      composerInputRef.current?.focus();
    },
    onTranscribeAudio: props.onTranscribeAudio,
  });
  const hasMessages = props.messages.length > 0;
  const hasUserPrompts = props.messages.some((message) => message.role === 'user');
  const units = useMemo(
    () => normalizeActivityTimeline(props.messages, {
      preserveTrailingActivity: props.turnActive,
    }),
    [props.messages, props.turnActive],
  );
  const unitKeys = useMemo(() => unitKeysForDisplay(units), [units]);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);

  const retryFromMessage = useCallback((messageId: string) => async () => {
    if (props.turnActive || retryingMessageId) return;
    setRetryingMessageId(messageId);
    try {
      await props.onRetryFromMessage(messageId);
    } finally {
      setRetryingMessageId(null);
    }
  }, [props, retryingMessageId]);

  const lastMessageUnitIndex = useMemo(() => {
    for (let i = units.length - 1; i >= 0; i -= 1) {
      const unit = units[i];
      if (unit.type === 'message') return i;
    }
    return -1;
  }, [units]);

  function canRetryFromMessage(unit: TurnUnit, unitIndex: number): boolean {
    if (unit.type !== 'message') return false;
    const message = unit.message;
    if (message.role !== 'assistant' || message.kind === 'trace') return false;
    if (message.isStreaming) return false;
    // Retry is offered only on the very last assistant message of the
    // thread so we don't trample intermediate checkpoints. Older assistant
    // replies can still be forked.
    if (unitIndex !== lastMessageUnitIndex) return false;
    const tailHasUserPrompt = units.slice(unitIndex + 1).some(
      (row) => row.type === 'message' && row.message.role === 'user',
    );
    if (tailHasUserPrompt) return false;
    return true;
  }

  const forkIndexes = useMemo(
    () => assistantForkIndexes(units, props.userMessageOffset),
    [props.userMessageOffset, units],
  );
  const forkBoundaryAfterUnitIndex = useMemo(
    () => unitIndexAfterMessageCount(units, props.forkBoundaryMessageCount),
    [props.forkBoundaryMessageCount, units],
  );
  const liveActivityClusterIndices = useMemo(
    () => props.turnActive ? currentActivityClusterIndices(units) : new Set<number>(),
    [props.turnActive, units],
  );
  const filePreviewAvailabilityCacheRef = useRef(
    new Map<string, FilePreviewAvailabilityCacheEntry>(),
  );
  const filePreviewAvailabilityRevision = props.messages.length;
  const resolveFilePreviewAvailability = useCallback((path: string) => {
    if (!props.activeKey) return Promise.resolve(false);
    const cacheKey = `${props.bootstrap.api_token}\n${props.activeKey}\n${path}`;
    const cache = filePreviewAvailabilityCacheRef.current;
    const cached = cache.get(cacheKey);
    if (
      cached
      && (cached.available !== false || cached.revision === filePreviewAvailabilityRevision)
    ) {
      return cached.promise;
    }
    const pending = fetchFilePreviewAvailability(
      props.activeKey,
      path,
    ).catch((error: unknown) => {
      if (error instanceof ApiError) {
        if (error.status === 404 && /API route not found/i.test(error.message)) return true;
        if ([400, 403, 404, 415].includes(error.status)) return false;
      }
      return false;
    });
    const entry: FilePreviewAvailabilityCacheEntry = {
      promise: pending,
      revision: filePreviewAvailabilityRevision,
    };
    cache.set(cacheKey, entry);
    void pending.then((available) => {
      if (cache.get(cacheKey) === entry) entry.available = available;
    });
    return pending;
  }, [
    filePreviewAvailabilityRevision,
    props.activeKey,
    props.bootstrap.api_token,
  ]);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((payload) => {
        if (!cancelled) setSettings(payload);
      })
      .catch(() => {
        // Voice limits fall back to the WebUI defaults when settings are unavailable.
      });
    return () => { cancelled = true; };
  }, [props.bootstrap.api_token, props.modelSettingsRevision]);

  const modelScopeKey = props.activeSession?.key ?? '__new__';
  const localModelPreset = localModelSelection?.scopeKey === modelScopeKey
    ? localModelSelection.preset
    : null;
  const activeModelPreset = localModelPreset
    || props.activeSession?.modelPreset?.trim()
    || settings?.agent.model_preset?.trim()
    || 'default';
  const activeModelPresetInfo = settings?.model_presets.find(
    (preset) => preset.name === activeModelPreset,
  ) ?? null;
  const modelDisplayLabel = activeModelPresetInfo?.label?.trim()
    || props.turnModelName?.trim()
    || props.runtimeModelName?.trim()
    || props.bootstrap.model_name?.trim()
    || activeModelPreset
    || 'nanobot';
  const orderedModelPresets = useMemo(() => {
    const order = new Map(
      (settings?.model_call_order ?? []).map((name, index) => [name.trim(), index]),
    );
    return [...(settings?.model_presets ?? [])].sort((left, right) => (
      (order.get(left.name.trim()) ?? Number.POSITIVE_INFINITY)
      - (order.get(right.name.trim()) ?? Number.POSITIVE_INFINITY)
    ));
  }, [settings?.model_call_order, settings?.model_presets]);
  const onModelPresetChange = props.onModelPresetChange;
  const changeModelPreset = useCallback(async (name: string) => {
    const previous = localModelSelection;
    setLocalModelSelection({ scopeKey: modelScopeKey, preset: name });
    try {
      await onModelPresetChange(name);
    } catch (caught) {
      setLocalModelSelection(previous);
      Alert.alert(
        t('settings.models.selectModel'),
        caught instanceof Error ? caught.message : t('settings.status.loadError'),
      );
      throw caught;
    }
  }, [localModelSelection, modelScopeKey, onModelPresetChange, t]);

  const chatTitle = props.activeSession
    ? props.sidebarState.title_overrides[props.activeSession.key] || sessionTitle(props.activeSession)
    : t('sidebar.newChat');
  const currentSlashQuery = slashMenuDismissed ? null : slashQuery(composerText);
  const visibleSlashCommands = useMemo(() => {
    if (currentSlashQuery === null) return [];
    const query = currentSlashQuery.trim().toLowerCase();
    return props.slashCommands
      .filter((command) => {
        if (!query && command.command === '/restart') return false;
        if (!query && !props.turnActive && command.command === '/stop') return false;
        if (!query) return true;
        return [command.command, command.title, command.description, command.argHint]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        if (props.turnActive) {
          if (left.command === '/stop') return -1;
          if (right.command === '/stop') return 1;
        }
        if (query) return 0;
        const leftRecent = recentComposerCommands.indexOf(left.command);
        const rightRecent = recentComposerCommands.indexOf(right.command);
        if (leftRecent === -1 && rightRecent === -1) return 0;
        if (leftRecent === -1) return 1;
        if (rightRecent === -1) return -1;
        return leftRecent - rightRecent;
      })
      .slice(0, 8)
      .map((command): ComposerSlashCommand => ({
        ...command,
        recent: recentComposerCommands.includes(command.command),
      }));
  }, [currentSlashQuery, props.slashCommands, props.turnActive, recentComposerCommands]);
  const currentSkillQuery = slashMenuDismissed
    ? null
    : skillMentionQuery(composerText, composerCursor);
  const visibleSkillCandidates = useMemo(
    () => skillMentionCandidates(currentSkillQuery, props.skills, recentComposerCommands),
    [currentSkillQuery, props.skills, recentComposerCommands],
  );
  const currentMentionQuery = mentionMenuDismissed
    ? null
    : capabilityMentionQuery(composerText, composerCursor);
  const visibleMentionCandidates = useMemo(
    () => capabilityMentionCandidates(currentMentionQuery, props.cliApps, props.mcpPresets),
    [currentMentionQuery, props.cliApps, props.mcpPresets],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readLocalPreferences(), readComposerRecents()]).then(([stored, recents]) => {
      if (cancelled) return;
      setPreferences(stored);
      void setAppLanguage(normalizeLocale(stored.language));
      setRecentComposerCommands(recents);
    });
    return () => { cancelled = true; };
  }, []);

  const changePreferences = (next: LocalPreferences) => {
    setPreferences(next);
    void setAppLanguage(normalizeLocale(next.language));
    void writeLocalPreferences(next);
  };

  useEffect(() => {
    if (utilityView === 'chat') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setUtilityView('chat');
      return true;
    });
    return () => subscription.remove();
  }, [utilityView]);

  const handleSessionReset = useCallback(() => {
    setPromptNavigatorOpen(false);
    setSessionInfoOpen(false);
    setQuotedContext(null);
  }, []);

  const {
    listRef,
    atBottom,
    scrollToBottom,
    loadEarlier,
    handleThreadScroll,
    handleContentSizeChange,
    jumpToPrompt,
    handleScrollToIndexFailed,
    onMomentumScrollEnd,
    onScrollBeginDrag,
    onScrollEndDrag,
  } = useChatScroll({
    activeKey: props.activeKey,
    hasMessages,
    messages: props.messages,
    units,
    loadingOlder,
    hasMoreBefore,
    onLoadOlder,
    onSessionReset: handleSessionReset,
  });
  useEffect(() => {
    const wasTurnActive = wasTurnActiveRef.current;
    wasTurnActiveRef.current = turnActive;
    if (!wasTurnActive || turnActive) return;
    if (skipNextQueueFlushRef.current) {
      skipNextQueueFlushRef.current = false;
      return;
    }
    if (queuedPrompts.length === 0) return;
    const next = queuedPrompts[0];
    const timer = setTimeout(() => {
      setQueuedPrompts((current) => current.filter((prompt) => prompt.id !== next.id));
      setSending(true);
      void onSendMessage(next.text, next.attachments, next.options)
        .catch(() => {
          setQueuedPrompts((current) => [next, ...current]);
        })
        .finally(() => setSending(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [onSendMessage, queuedPrompts, turnActive]);

  const handleStop = () => {
    skipNextQueueFlushRef.current = queuedPrompts.length > 0;
    setQueuedPrompts([]);
    props.onStopTurn();
  };

  const clearComposerDraft = () => {
    setComposerText('');
    setQuotedContext(null);
    setSlashMenuDismissed(false);
    setMentionMenuDismissed(false);
    setComposerCursor(0);
  };

  const recordComposerRecent = useCallback((command: string) => {
    setRecentComposerCommands((current) => {
      const next = [command, ...current.filter((item) => item !== command)].slice(0, 5);
      void writeComposerRecents(next);
      return next;
    });
  }, []);

  const selectSlashCommand = (command: ComposerSlashCommand) => {
    if (command.command === '/stop' && props.turnActive) {
      handleStop();
      clearComposerDraft();
      setSlashMenuDismissed(true);
      return;
    }
    recordComposerRecent(command.command);
    const nextValue = command.acceptsArgs ? `${command.command} ` : command.command;
    setComposerText(nextValue);
    setSlashMenuDismissed(true);
    setMentionMenuDismissed(false);
    setComposerCursor(nextValue.length);
    setTimeout(() => {
      composerInputRef.current?.focus();
      composerInputRef.current?.setNativeProps({
        selection: { start: nextValue.length, end: nextValue.length },
      });
    }, 0);
  };

  const selectSkillCandidate = (candidate: SkillMentionCandidate) => {
    if (!currentSkillQuery) return;
    recordComposerRecent(candidate.command);
    const next = insertSkillMention(composerText, currentSkillQuery, candidate);
    setComposerText(next.value);
    setComposerCursor(next.cursor);
    setSlashMenuDismissed(true);
    setMentionMenuDismissed(false);
    setTimeout(() => {
      composerInputRef.current?.focus();
      composerInputRef.current?.setNativeProps({
        selection: { start: next.cursor, end: next.cursor },
      });
    }, 0);
  };

  const selectMentionCandidate = (candidate: CapabilityMentionCandidate) => {
    if (!currentMentionQuery) return;
    const next = insertCapabilityMention(composerText, currentMentionQuery, candidate);
    setComposerText(next.value);
    setComposerCursor(next.cursor);
    setMentionMenuDismissed(true);
    setSlashMenuDismissed(false);
    setTimeout(() => {
      composerInputRef.current?.focus();
      composerInputRef.current?.setNativeProps({
        selection: { start: next.cursor, end: next.cursor },
      });
    }, 0);
  };

  const submit = async () => {
    const content = composerText.trim();
    const outboundContent = formatQuotedUserMessage(content, quotedContext);
    const attachments = staged.readyAttachments;
    const capabilityPayloads = activeCapabilityMentionPayloads(
      content,
      props.cliApps,
      props.mcpPresets,
    );
    const messageOptions: SendMessageOptions = {
      ...(capabilityPayloads.cliApps.length ? { cliApps: capabilityPayloads.cliApps } : {}),
      ...(capabilityPayloads.mcpPresets.length ? { mcpPresets: capabilityPayloads.mcpPresets } : {}),
      ...(quotedContext?.trim()
        ? { quotedContext: normalizeQuotedContext(quotedContext) }
        : {}),
    };
    if (
      (!outboundContent && attachments.length === 0) ||
      staged.encoding ||
      staged.hasErrors ||
      sending
    ) return;

    const hasPlainTextCommandPayload = attachments.length === 0
      && capabilityPayloads.cliApps.length === 0
      && capabilityPayloads.mcpPresets.length === 0;
    const slashLifecycle = hasPlainTextCommandPayload
      ? slashCommandLifecycle(content, props.slashCommands)
      : null;
    if (slashLifecycle === 'stop_active_turn' && props.turnActive) {
      clearComposerDraft();
      handleStop();
      return;
    }

    const sideChannel = isSideChannelLifecycle(slashLifecycle);
    if (props.turnActive && !sideChannel && !content.trimStart().startsWith('/')) {
      queuedPromptCounterRef.current += 1;
      setQueuedPrompts((current) => [...current, {
        id: `queued-prompt-${Date.now()}-${queuedPromptCounterRef.current}`,
        text: content,
        attachments: [...attachments],
        options: messageOptions,
      }]);
      clearComposerDraft();
      staged.clear();
      return;
    }

    const options: SendMessageOptions = {
      ...messageOptions,
      ...(sideChannel ? { sideChannel: true } : {}),
      ...(slashLifecycle === 'finalize_active_turn'
        ? { finalizeActiveTurn: true }
        : {}),
    };
    const pendingQuote = quotedContext;
    clearComposerDraft();
    setQueuedPrompts([]);
    setSending(true);
    try {
      await props.onSendMessage(content, attachments, options);
      staged.clear();
    } catch {
      setComposerText(content);
      setQuotedContext(pendingQuote);
      setSlashMenuDismissed(false);
      setMentionMenuDismissed(false);
      setComposerCursor(content.length);
      setTimeout(() => {
        composerInputRef.current?.focus();
        composerInputRef.current?.setNativeProps({
          selection: { start: content.length, end: content.length },
        });
      }, 0);
    } finally {
      setSending(false);
    }
  };

  const openAttachmentMenu = () => {
    Alert.alert(t('thread.composer.attachImage'), t('thread.composer.attachImage'), [
      { text: t('settings.actions.cancel'), style: 'cancel' },
      { text: t('settings.nav.image'), onPress: () => void staged.pickImages() },
      { text: t('message.fileEditOpenFile'), onPress: () => void staged.pickDocuments() },
    ]);
  };

  const resetSessionUi = () => {
    setUtilityView('chat');
    setComposerText('');
    setQuotedContext(null);
    setPromptNavigatorOpen(false);
    setSessionInfoOpen(false);
    setSlashMenuDismissed(false);
    setMentionMenuDismissed(false);
    setComposerCursor(0);
    setQueuedPrompts([]);
    skipNextQueueFlushRef.current = false;
    staged.clear();
  };

  const selectSession = (key: string | null) => {
    resetSessionUi();
    props.onSelectSession(key);
  };

  const startNewChat = () => {
    resetSessionUi();
    props.onStartNewChat();
  };

  const startNewChatInProject = (projectPath: string, projectName: string) => {
    resetSessionUi();
    props.onStartNewChatInProject(projectPath, projectName);
  };

  const forkFromMessage = async (messageId: string, beforeUserIndex: number) => {
    if (forkingMessageId) return;
    setQueuedPrompts([]);
    skipNextQueueFlushRef.current = false;
    setForkingMessageId(messageId);
    try {
      await props.onForkFromMessage(beforeUserIndex);
    } catch {
      // The app hook exposes the server error in the persistent banner.
    } finally {
      setForkingMessageId(null);
    }
  };

  const composer = (
    <>
      {props.streamError ? (
        <StreamErrorNotice
          colors={colors}
          error={props.streamError}
          onDismiss={props.onDismissStreamError}
        />
      ) : null}
      <ExtractedComposer
        attachmentError={staged.error}
        attachments={staged.attachments}
        attachmentBusy={staged.encoding}
        attachmentFull={staged.full}
        activeModelPreset={activeModelPreset}
        colors={colors}
        dark={dark}
        disabled={sending}
        goalState={props.goalState}
        inputRef={composerInputRef}
        modelName={modelDisplayLabel}
        mentionCandidates={visibleMentionCandidates}
        skillCandidates={visibleSkillCandidates}
        modelPresets={orderedModelPresets}
        quotedContext={quotedContext}
        runStartedAt={props.runStartedAt}
        workspaceScope={props.activeWorkspaceScope}
        workspaceDefaultScope={props.workspaces?.default_scope ?? null}
        workspaceControls={props.workspaces?.controls ?? null}
        workspaceError={props.workspaceError}
        workspaceScopeDisabled={props.turnActive}
        onWorkspaceScopeChange={props.onWorkspaceScopeChange}
        onAddAttachment={openAttachmentMenu}
        onChangeText={(value) => {
          setComposerText(value);
          setSlashMenuDismissed(false);
          setMentionMenuDismissed(false);
        }}
        onClearQuote={() => setQuotedContext(null)}
        onCursorChange={(cursor) => {
          setComposerCursor(cursor);
          setSlashMenuDismissed(false);
          setMentionMenuDismissed(false);
        }}
        onMentionCandidateSelect={selectMentionCandidate}
        onSkillCandidateSelect={selectSkillCandidate}
        onModelPresetChange={changeModelPreset}
        onOpenModelSettings={() => setUtilityView('settings')}
        onRemoveQueuedPrompt={(id) => {
          setQueuedPrompts((current) => current.filter((prompt) => prompt.id !== id));
        }}
        onRemoveAttachment={staged.remove}
        onSelectSlashCommand={selectSlashCommand}
        onSend={submit}
        onStop={handleStop}
        queuedPrompts={queuedPrompts}
        readyAttachmentCount={staged.readyAttachments.length}
        slashCommands={visibleSlashCommands}
        turnActive={props.turnActive}
        value={composerText}
        variant={hasMessages || props.threadLoading ? 'thread' : 'hero'}
        voiceError={voiceError ? t(`thread.composer.voiceErrors.${voiceError}`) : null}
        voiceRecorder={voiceRecorder}
      />
    </>
  );

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <View style={{ height: insets.top, backgroundColor: colors.background }} />
      <ChatHeader
        activeKey={props.activeKey}
        colors={colors}
        dark={dark}
        preferences={preferences}
        utilityView={utilityView}
        chatTitle={chatTitle}
        hasUserPrompts={hasUserPrompts}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenPromptNavigator={() => setPromptNavigatorOpen(true)}
        onOpenSessionInfo={() => setSessionInfoOpen(true)}
        onChangePreferences={changePreferences}
      />

      {props.error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground }]}>
          <Text numberOfLines={2} style={[styles.errorText, { color: colors.errorText }]}>{props.error}</Text>
          <Pressable accessibilityLabel={t('common.dismiss')} hitSlop={8} onPress={props.onClearError}>
            <X color={colors.errorText} size={16} />
          </Pressable>
        </View>
      ) : null}

      {utilityView === 'apps' ? (
        <AppsScreen
          key={`apps:${props.bootstrap.token}`}
          colors={colors}
          initialCliApps={props.cliApps}
          initialMcpPresets={props.mcpPresets}
          onBackToChat={() => setUtilityView('chat')}
          onCliAppsChanged={props.onCliAppsChanged}
          onMcpPresetsChanged={props.onMcpPresetsChanged}
          onRestart={props.onRestart}
          restartPolicy={runtimePolicy}
        />
      ) : utilityView === 'skills' ? (
        <SkillsScreen
          colors={colors}
        />
      ) : utilityView === 'automations' ? (
        <AutomationsScreen
          colors={colors}
          onOpenLinkedChat={(sessionKey: string) => {
            setUtilityView('chat');
            props.onSelectSession(sessionKey);
          }}
        />
      ) : utilityView === 'settings' ? (
        <SettingsScreen
          colors={colors}
          onChangePreferences={changePreferences}
          onRestart={props.onRestart}
          onSettingsChange={setSettings}
          preferences={preferences}
          runtimeMetadata={props.bootstrap}
        />
      ) : !hasMessages ? (
        props.threadLoading ? (
          <>
            <View style={styles.loadingThreadArea}>
              <View style={styles.loadingConversation}>
                <ActivityIndicator color={colors.muted} />
                <Text style={[styles.loadingText, { color: colors.muted }]}>{t('thread.loadingConversation')}</Text>
              </View>
            </View>
            <View style={[styles.threadComposer, { backgroundColor: colors.background }]}>{composer}</View>
          </>
        ) : (
          <View style={styles.heroArea}>
            <View style={styles.heroContent}>
              <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.greeting, { color: colors.foreground }]}>
                {greeting}
              </Text>
              <View style={styles.heroComposer}>{composer}</View>
            </View>
          </View>
        )
      ) : (
        <>
          <ChatThread
            listRef={listRef}
            atBottom={atBottom}
            scrollToBottom={scrollToBottom}
            loadEarlier={loadEarlier}
            handleThreadScroll={handleThreadScroll}
            handleContentSizeChange={handleContentSizeChange}
            handleScrollToIndexFailed={handleScrollToIndexFailed}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={onScrollEndDrag}
            units={units}
            unitKeys={unitKeys}
            forkIndexes={forkIndexes}
            forkBoundaryAfterUnitIndex={forkBoundaryAfterUnitIndex}
            liveActivityClusterIndices={liveActivityClusterIndices}
            forkingMessageId={forkingMessageId}
            retryingMessageId={retryingMessageId}
            colors={colors}
            dark={dark}
            preferences={preferences}
            cliApps={props.cliApps}
            mcpPresets={props.mcpPresets}
            slashCommands={props.slashCommands}
            hasMoreBefore={props.hasMoreBefore}
            loadingOlder={props.loadingOlder}
            canRetryFromMessage={canRetryFromMessage}
            forkFromMessage={forkFromMessage}
            retryFromMessage={retryFromMessage}
            resolveFilePreviewAvailability={resolveFilePreviewAvailability}
            onOpenFilePreview={props.activeKey ? setFilePreviewPath : undefined}
            onQuote={setAssistantQuoteSource}
          />
          <View style={[styles.threadComposer, { backgroundColor: colors.background }]}>{composer}</View>
        </>
      )}
      <View style={{ height: Math.max(insets.bottom, 7), backgroundColor: colors.background }} />

      <ChatModals
        activeKey={props.activeKey}
        colors={colors}
        dark={dark}
        chatTitle={chatTitle}
        messages={props.messages}
        sessions={props.sessions}
        sidebarState={props.sidebarState}
        sessionsLoading={props.sessionsLoading}
        connectionStatus={props.connectionStatus}
        defaultWorkspacePath={props.workspaces?.default_scope.project_path ?? null}
        utilityView={utilityView}
        drawerOpen={drawerOpen}
        sessionSearchOpen={sessionSearchOpen}
        promptNavigatorOpen={promptNavigatorOpen}
        sessionInfoOpen={sessionInfoOpen}
        assistantQuoteSource={assistantQuoteSource}
        filePreviewPath={filePreviewPath}
        token={props.bootstrap.api_token}
        composerInputRef={composerInputRef}
        onCloseDrawer={() => setDrawerOpen(false)}
        onCloseSessionSearch={() => setSessionSearchOpen(false)}
        onClosePromptNavigator={() => setPromptNavigatorOpen(false)}
        onCloseSessionInfo={() => setSessionInfoOpen(false)}
        onCloseAssistantQuote={() => setAssistantQuoteSource(null)}
        onCloseFilePreview={() => setFilePreviewPath(null)}
        onConfirmAssistantQuote={(content) => {
          setQuotedContext(normalizeQuotedContext(content));
          setTimeout(() => composerInputRef.current?.focus(), 0);
        }}
        onJumpToPrompt={jumpToPrompt}
        onSelectSession={selectSession}
        onStartNewChat={startNewChat}
        onStartNewChatInProject={startNewChatInProject}
        onOpenSearch={() => {
          setDrawerOpen(false);
          setSessionSearchOpen(true);
        }}
        onOpenApps={() => {
          setUtilityView('apps');
          setDrawerOpen(false);
        }}
        onOpenSkills={() => {
          setUtilityView('skills');
          setDrawerOpen(false);
        }}
        onOpenAutomations={() => {
          setUtilityView('automations');
          setDrawerOpen(false);
        }}
        onOpenSettings={() => {
          setUtilityView('settings');
          setDrawerOpen(false);
        }}
        onLogout={props.onLogout}
        onDeleteSession={props.onDeleteSession}
        onGetSessionAutomations={props.onGetSessionAutomations}
        onRenameSession={props.onRenameSession}
        onRenameProject={props.onRenameProject}
        onSetShowArchived={props.onSetShowArchived}
        onToggleArchived={props.onToggleArchived}
        onToggleGroup={props.onToggleSidebarGroup}
        onTogglePinned={props.onTogglePinned}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errorBanner: {
    marginHorizontal: 13,
    marginTop: 3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  heroArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 70 },
  heroContent: { width: '100%', maxWidth: 720, alignSelf: 'center', alignItems: 'center' },
  greeting: { width: '100%', fontSize: 34, lineHeight: 39, fontWeight: '400', textAlign: 'center' },
  heroComposer: { width: '100%', marginTop: 28 },
  loadingThreadArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingConversation: { alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13 },
  threadComposer: { paddingHorizontal: 10, paddingTop: 5 },
});
