import {
  ArrowDown,
  ArrowUp,
  Brain,
  Check,
  Copy,
  FileText,
  GitFork,
  ListTodo,
  ListTree,
  Menu,
  Mic,
  Moon,
  Paperclip,
  Quote,
  RotateCw,
  Square,
  Sun,
  X,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { Image as ExpoImage } from 'expo-image';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { setAppLanguage } from '@/i18n';

import { useAttachments } from '@/hooks/use-attachments';
import { useLogoFallback } from '@/hooks/use-logo-fallback';
import {
  type VoiceRecorderController,
  type VoiceRecorderError,
  useVoiceRecorder,
} from '@/hooks/use-voice-recorder';
import { ApiError, fetchFilePreviewAvailability, fetchSettings } from '@/lib/api';
import {
  normalizeActivityTimeline,
  type TurnUnit,
} from '@/lib/activity-timeline';
import { formatDateTime, formatMessageEndTime, sessionTitle } from '@/lib/format';
import { markdownToSelectableText } from '@/lib/markdown-plain-text';
import { DEFAULT_SERVER_URL } from '@/lib/config';
import {
  activeCapabilityMentionPayloads,
  capabilityMentionCandidates,
  capabilityMentionQuery,
  insertCapabilityMention,
  type CapabilityMentionCandidate,
} from '@/lib/capability-mentions';
import {
  DEFAULT_LOCAL_PREFS,
  readComposerRecents,
  readLocalPreferences,
  writeComposerRecents,
  writeLocalPreferences,
  type LocalPreferences,
} from '@/lib/local-preferences';
import { logoFallbackUrls } from '@/lib/provider-brand';
import { resolveRuntimeClientPolicy } from '@/lib/runtime-capabilities';
import {
  isSideChannelLifecycle,
  matchingSlashCommand,
  slashCommandLifecycle,
  slashQuery,
} from '@/lib/slash-command';
import {
  insertSkillMention,
  skillMentionCandidates,
  skillMentionQuery,
  type SkillMentionCandidate,
} from '@/lib/skill-mentions';
import {
  formatQuotedUserMessage,
  normalizeQuotedContext,
  parseQuotedUserMessage,
} from '@/lib/user-message-quote';
import type {
  BootstrapResponse,
  ChatSummary,
  CliAppInfo,
  CliAppsPayload,
  ComposerAttachment,
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
  WorkspacesPayload,
  WorkspaceScopePayload,
} from '@/types/nanobot';

import { AgentActivityCluster } from './agent-activity-cluster';
import { AssistantQuoteModal } from './assistant-quote-modal';
import { AutomationsScreen } from './automations-screen';
import { AppsScreen } from './apps-screen';
import { FilePreviewModal } from './file-preview-modal';
import { MarkdownText } from './markdown-text';
import { MessageMediaGallery } from './message-media-gallery';
import { ModelPresetMenu } from './model-preset-menu';
import { PromptNavigator } from './prompt-navigator';
import { ReasoningBubble } from './reasoning-bubble';
import { RunGoalStatus } from './run-goal-status';
import { SkillsScreen } from './skills-screen';
import { SessionInfoModal } from './session-info-modal';
import { SessionSearchModal } from './session-search-modal';
import { SettingsScreen } from './settings-screen';
import { SidebarDrawer } from './sidebar-drawer';
import { StreamErrorNotice } from './stream-error-notice';
import { WorkspaceAccessMenu, WorkspaceProjectPicker } from './workspace-controls';

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

const BOTTOM_THRESHOLD_PX = 72;

function formatVoiceDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

function assistantForkIndexes(units: TurnUnit[], userMessageOffset: number): Array<number | undefined> {
  const finalAssistant = new Array<boolean>(units.length).fill(true);
  let hasLaterUnitBeforeUser = false;
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (unit.type === 'message' && unit.message.role === 'user') {
      hasLaterUnitBeforeUser = false;
      continue;
    }
    if (unit.type === 'message' && unit.message.role === 'assistant') {
      finalAssistant[index] = !hasLaterUnitBeforeUser;
    }
    hasLaterUnitBeforeUser = true;
  }

  let nextUserIndex = Math.max(0, userMessageOffset);
  return units.map((unit, index) => {
    const forkIndex = unit.type === 'message' &&
      unit.message.role === 'assistant' &&
      finalAssistant[index]
      ? nextUserIndex
      : undefined;
    if (unit.type === 'message' && unit.message.role === 'user') nextUserIndex += 1;
    return forkIndex;
  });
}

function unitIndexAfterMessageCount(
  units: TurnUnit[],
  messageCount: number | null | undefined,
): number | null {
  if (messageCount == null || messageCount <= 0) return null;
  let seen = 0;
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    seen += unit.type === 'activity' ? unit.messages.length : 1;
    if (seen >= messageCount) return index;
  }
  return null;
}

function currentActivityClusterIndices(units: TurnUnit[]): Set<number> {
  const indices = new Set<number>();
  let markedCurrentActivity = false;
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (unit.type === 'activity') {
      if (!markedCurrentActivity) {
        indices.add(index);
        markedCurrentActivity = true;
      }
      continue;
    }
    if (unit.message.role === 'assistant' && unit.message.isStreaming) continue;
    if (unit.message.role === 'user') break;
  }
  return indices;
}

function unitKeysForDisplay(units: TurnUnit[]): string[] {
  const bases = units.map(unitKeyBase);
  const totals = new Map<string, number>();
  const occurrences = new Map<string, number>();

  for (const base of bases) {
    totals.set(base, (totals.get(base) ?? 0) + 1);
  }

  return bases.map((base) => {
    const isUserTurn = base.startsWith('turn-') && base.endsWith('-user');
    if (!isUserTurn && totals.get(base) === 1) return base;
    const next = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, next);
    return `${base}-${next}`;
  });
}

function unitKeyBase(unit: TurnUnit, index: number): string {
  if (unit.type === 'activity') {
    const anchor = unit.messages[0];
    const turnKey = stableTurnMessageKey(anchor, 'activity');
    if (turnKey) return turnKey;
    const anchorId = anchor?.id;
    return anchorId != null ? `activity-${anchorId}` : `activity-idx-${index}`;
  }
  const turnKey = stableTurnMessageKey(unit.message);
  if (turnKey) return turnKey;
  return unit.message.id || `message-${index}`;
}

function stableTurnMessageKey(message: UIMessage | undefined, fallbackPhase?: string): string | null {
  if (!message?.turnId) return null;
  const phase = message.turnPhase ?? fallbackPhase ?? message.kind ?? message.role;
  if (message.role === 'user') return `turn-${message.turnId}-user`;
  if (message.kind === 'trace') {
    return `turn-${message.turnId}-${phase}-${message.activitySegmentId ?? 'activity'}`;
  }
  return `turn-${message.turnId}-${phase}`;
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
  const [atBottom, setAtBottom] = useState(true);
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
  const listRef = useRef<FlatList<TurnUnit>>(null);
  const composerInputRef = useRef<TextInput>(null);
  const firstMessageIdRef = useRef<string | null>(null);
  const queuedPromptCounterRef = useRef(0);
  const wasTurnActiveRef = useRef(turnActive);
  const autoFollowRef = useRef(true);
  const pendingPromptIndexRef = useRef<number | null>(null);
  const userScrollingRef = useRef(false);
  const olderLoadInFlightRef = useRef(false);
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
      DEFAULT_SERVER_URL,
      props.bootstrap.api_token,
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
    fetchSettings(DEFAULT_SERVER_URL, props.bootstrap.api_token)
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
      void setAppLanguage(stored.language);
      setRecentComposerCommands(recents);
    });
    return () => { cancelled = true; };
  }, []);

  const changePreferences = (next: LocalPreferences) => {
    setPreferences(next);
    void setAppLanguage(next.language);
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

  const scrollToBottom = useCallback((animated = true, force = false) => {
    if (force) autoFollowRef.current = true;
    if (autoFollowRef.current || force) {
      listRef.current?.scrollToEnd({ animated });
      setAtBottom(true);
    }
  }, []);

  useEffect(() => {
    autoFollowRef.current = true;
    pendingPromptIndexRef.current = null;
    firstMessageIdRef.current = null;
    const resetTimer = setTimeout(() => {
      setAtBottom(true);
      setPromptNavigatorOpen(false);
      setSessionInfoOpen(false);
      setQuotedContext(null);
    }, 0);
    if (!props.activeKey) return () => clearTimeout(resetTimer);
    const scrollTimer = setTimeout(() => scrollToBottom(false, true), 80);
    return () => {
      clearTimeout(resetTimer);
      clearTimeout(scrollTimer);
    };
  }, [props.activeKey, scrollToBottom]);

  useEffect(() => {
    if (!hasMessages) return;
    const firstMessageId = props.messages[0]?.id ?? null;
    const prependedOlderMessages =
      firstMessageIdRef.current !== null && firstMessageIdRef.current !== firstMessageId;
    firstMessageIdRef.current = firstMessageId;
    if (prependedOlderMessages || !autoFollowRef.current) return;
    const timer = setTimeout(() => scrollToBottom(false), 40);
    return () => clearTimeout(timer);
  }, [hasMessages, props.messages, scrollToBottom]);

  const loadEarlier = useCallback(() => {
    if (
      olderLoadInFlightRef.current
      || loadingOlder
      || !hasMoreBefore
    ) return;
    olderLoadInFlightRef.current = true;
    void onLoadOlder().finally(() => {
      olderLoadInFlightRef.current = false;
    });
  }, [hasMoreBefore, loadingOlder, onLoadOlder]);

  const handleThreadScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = Math.max(
      0,
      contentSize.height - layoutMeasurement.height - contentOffset.y,
    );
    const nearBottom = distance <= BOTTOM_THRESHOLD_PX;
    autoFollowRef.current = nearBottom;
    setAtBottom((current) => current === nearBottom ? current : nearBottom);
    if (userScrollingRef.current && contentOffset.y <= 96) loadEarlier();
  }, [loadEarlier]);

  const handleContentSizeChange = useCallback(() => {
    if (!autoFollowRef.current) return;
    scrollToBottom(false);
  }, [scrollToBottom]);

  const jumpToPrompt = useCallback((promptId: string) => {
    const index = units.findIndex(
      (unit) => unit.type === 'message'
        && unit.message.role === 'user'
        && unit.message.id === promptId,
    );
    if (index < 0) return;
    autoFollowRef.current = false;
    setAtBottom(false);
    pendingPromptIndexRef.current = index;
    listRef.current?.scrollToIndex({
      animated: true,
      index,
      viewOffset: 16,
      viewPosition: 0,
    });
  }, [units]);

  const handleScrollToIndexFailed = useCallback((info: {
    averageItemLength: number;
    index: number;
  }) => {
    pendingPromptIndexRef.current = info.index;
    listRef.current?.scrollToOffset({
      animated: false,
      offset: Math.max(0, info.averageItemLength * info.index),
    });
    setTimeout(() => {
      if (pendingPromptIndexRef.current !== info.index) return;
      listRef.current?.scrollToIndex({
        animated: true,
        index: info.index,
        viewOffset: 16,
        viewPosition: 0,
      });
      pendingPromptIndexRef.current = null;
    }, 120);
  }, []);

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
      <Composer
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
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <View style={{ height: insets.top, backgroundColor: colors.background }} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={t('thread.header.toggleSidebar')}
          hitSlop={8}
          onPress={() => setDrawerOpen(true)}
          style={({ pressed }) => [styles.headerButton, pressed && { backgroundColor: colors.pressed }]}
        >
          <Menu color={colors.muted} size={18} strokeWidth={1.8} />
        </Pressable>
        {utilityView === 'apps' ? (
          <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.muted }]}>{t('sidebar.apps')}</Text>
        ) : utilityView === 'skills' ? (
          <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.muted }]}>{t('sidebar.skills.title')}</Text>
        ) : utilityView === 'automations' ? (
          <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.muted }]}>{t('sidebar.automations')}</Text>
        ) : utilityView === 'settings' ? (
          <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.muted }]}>{t('sidebar.settings')}</Text>
        ) : props.activeKey ? (
          <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.muted }]}>{chatTitle}</Text>
        ) : <View />}
        <View style={styles.headerActions}>
          {utilityView === 'chat' && props.activeKey && hasUserPrompts ? (
            <Pressable
              accessibilityLabel={t('thread.promptNavigator.open')}
              hitSlop={6}
              onPress={() => setPromptNavigatorOpen(true)}
              style={({ pressed }) => [styles.headerButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <ListTree color={colors.muted} size={17} strokeWidth={1.8} />
            </Pressable>
          ) : null}
          {utilityView === 'chat' && props.activeKey ? (
            <Pressable
              accessibilityLabel={t('thread.header.sessionInfo')}
              hitSlop={6}
              onPress={() => setSessionInfoOpen(true)}
              style={({ pressed }) => [styles.headerButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <ListTodo color={colors.muted} size={17} strokeWidth={1.8} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={t('thread.header.toggleTheme')}
            hitSlop={8}
            onPress={() => changePreferences({ ...preferences, theme: dark ? 'light' : 'dark' })}
            style={({ pressed }) => [styles.headerButton, pressed && { backgroundColor: colors.pressed }]}
          >
            {dark
              ? <Sun color={colors.muted} size={18} strokeWidth={1.8} />
              : <Moon color={colors.muted} size={18} strokeWidth={1.8} />}
          </Pressable>
        </View>
      </View>

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
          token={props.bootstrap.api_token}
        />
      ) : utilityView === 'skills' ? (
        <SkillsScreen
          colors={colors}
          token={props.bootstrap.api_token}
        />
      ) : utilityView === 'automations' ? (
        <AutomationsScreen
          colors={colors}
          onOpenLinkedChat={(sessionKey) => {
            setUtilityView('chat');
            props.onSelectSession(sessionKey);
          }}
          token={props.bootstrap.api_token}
        />
      ) : utilityView === 'settings' ? (
        <SettingsScreen
          colors={colors}
          onChangePreferences={changePreferences}
          onRestart={props.onRestart}
          onSettingsChange={setSettings}
          preferences={preferences}
          runtimeMetadata={props.bootstrap}
          token={props.bootstrap.api_token}
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
          <View style={styles.threadListArea}>
            <FlatList
              ref={listRef}
            contentContainerStyle={[
              styles.messagesContent,
              {
                paddingBottom: 18,
                backgroundColor: colors.background,
                rowGap: preferences.density === 'compact' ? 3 : 10,
              },
            ]}
            data={units}
            keyExtractor={(_item, index) => unitKeys[index] ?? `unit-${index}`}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              props.hasMoreBefore ? (
                <Pressable
                  disabled={props.loadingOlder}
                  onPress={loadEarlier}
                  style={styles.loadOlderButton}
                >
                  {props.loadingOlder ? (
                    <ActivityIndicator color={colors.muted} size="small" />
                  ) : (
                    <Text style={[styles.loadOlderText, { color: colors.muted }]}>{t('thread.loadEarlier')}</Text>
                  )}
                </Pressable>
              ) : null
            }
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onContentSizeChange={handleContentSizeChange}
            onMomentumScrollEnd={() => { userScrollingRef.current = false; }}
            onScroll={handleThreadScroll}
            onScrollBeginDrag={() => { userScrollingRef.current = true; }}
            onScrollEndDrag={() => { userScrollingRef.current = false; }}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            scrollEventThrottle={32}
            renderItem={({ item, index }) => {
              const next = units[index + 1];
              const hasBodyBelow = item.type === 'activity' &&
                next?.type === 'message' &&
                next.message.role === 'assistant';
              return (
                <View>
                  {item.type === 'activity' ? (
                    <View style={styles.activityRow}>
                      <AgentActivityCluster
                        activityMode={preferences.activityMode}
                        colors={colors}
                        cliApps={props.cliApps}
                        hasBodyBelow={hasBodyBelow}
                        fileEditDisplayMode={preferences.fileEditDisplayMode}
                        isTurnStreaming={liveActivityClusterIndices.has(index)}
                        messages={item.messages}
                        mcpPresets={props.mcpPresets}
                        onOpenFilePreview={props.activeKey ? setFilePreviewPath : undefined}
                        resolveFilePreviewAvailability={resolveFilePreviewAvailability}
                        startedAtMs={item.startedAtMs}
                        turnLatencyMs={item.turnLatencyMs}
                      />
                    </View>
                  ) : (
                    <MessageRow
                      colors={colors}
                      codeWrap={preferences.codeWrap}
                      dark={dark}
                      forkBusy={forkingMessageId === item.message.id}
                      forkIndex={forkIndexes[index]}
                      canRetry={canRetryFromMessage(item, index)}
                      isRetryBusy={retryingMessageId === item.message.id}
                      cliApps={props.cliApps}
                      mcpPresets={props.mcpPresets}
                      message={item.message}
                      slashCommands={props.slashCommands}
                      onFork={(beforeUserIndex) => void forkFromMessage(item.message.id, beforeUserIndex)}
                      onRetry={retryFromMessage(item.message.id)}
                      onOpenFilePreview={props.activeKey ? setFilePreviewPath : undefined}
                      onQuote={setAssistantQuoteSource}
                      resolveFilePreviewAvailability={resolveFilePreviewAvailability}
                    />
                  )}
                  {forkBoundaryAfterUnitIndex === index ? (
                    <ForkBoundaryDivider colors={colors} />
                  ) : null}
                </View>
              );
            }}
              showsVerticalScrollIndicator={false}
            />
            {!atBottom ? (
              <Pressable
                accessibilityLabel={t('thread.scrollToBottom')}
                onPress={() => scrollToBottom(true, true)}
                style={({ pressed }) => [
                  styles.scrollToBottomButton,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <ArrowDown color={colors.muted} size={18} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.threadComposer, { backgroundColor: colors.background }]}>{composer}</View>
        </>
      )}
      <View style={{ height: Math.max(insets.bottom, 7), backgroundColor: colors.background }} />

      <SidebarDrawer
        activeKey={props.activeKey}
        activeUtility={utilityView === 'chat' ? null : utilityView}
        connectionStatus={props.connectionStatus}
        defaultWorkspacePath={props.workspaces?.default_scope.project_path ?? null}
        loading={props.sessionsLoading}
        onClose={() => setDrawerOpen(false)}
        onLogout={props.onLogout}
        onNewChat={startNewChat}
        onNewChatInProject={startNewChatInProject}
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
        onDelete={props.onDeleteSession}
        onGetSessionAutomations={props.onGetSessionAutomations}
        onRename={props.onRenameSession}
        onRenameProject={props.onRenameProject}
        onSelect={selectSession}
        onSetShowArchived={props.onSetShowArchived}
        onToggleArchived={props.onToggleArchived}
        onToggleGroup={props.onToggleSidebarGroup}
        onTogglePinned={props.onTogglePinned}
        sessions={props.sessions}
        state={props.sidebarState}
        visible={drawerOpen}
      />
      {sessionSearchOpen ? (
        <SessionSearchModal
          activeKey={props.activeKey}
          colors={colors}
          loading={props.sessionsLoading}
          onClose={() => setSessionSearchOpen(false)}
          onSelect={selectSession}
          sessions={props.sessions}
          titleOverrides={props.sidebarState.title_overrides}
          visible
        />
      ) : null}
      <PromptNavigator
        colors={colors}
        messages={props.messages}
        onClose={() => setPromptNavigatorOpen(false)}
        onJumpToPrompt={jumpToPrompt}
        visible={promptNavigatorOpen}
      />
      <SessionInfoModal
        colors={colors}
        loadJobs={props.onGetSessionAutomations}
        onClose={() => setSessionInfoOpen(false)}
        sessionKey={props.activeKey}
        title={chatTitle}
        visible={sessionInfoOpen}
      />
      <AssistantQuoteModal
        colors={colors}
        content={assistantQuoteSource}
        onClose={() => setAssistantQuoteSource(null)}
        onConfirm={(content) => {
          setQuotedContext(normalizeQuotedContext(content));
          setTimeout(() => composerInputRef.current?.focus(), 0);
        }}
      />
      <FilePreviewModal
        colors={colors}
        dark={dark}
        onClose={() => setFilePreviewPath(null)}
        path={filePreviewPath}
        sessionKey={props.activeKey}
        token={props.bootstrap.api_token}
      />
    </KeyboardAvoidingView>
  );
}

interface Palette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  userBubble: string;
  userText: string;
  pressed: string;
  errorBackground: string;
  errorText: string;
}

function Composer({
  activeModelPreset,
  colors,
  dark,
  value,
  goalState,
  inputRef,
  modelName,
  mentionCandidates,
  skillCandidates,
  modelPresets,
  quotedContext,
  variant,
  turnActive,
  disabled,
  workspaceScope,
  workspaceDefaultScope,
  workspaceControls,
  workspaceError,
  workspaceScopeDisabled,
  attachments,
  attachmentBusy,
  attachmentFull,
  attachmentError,
  readyAttachmentCount,
  queuedPrompts,
  runStartedAt,
  slashCommands,
  voiceError,
  voiceRecorder,
  onAddAttachment,
  onClearQuote,
  onCursorChange,
  onMentionCandidateSelect,
  onSkillCandidateSelect,
  onModelPresetChange,
  onOpenModelSettings,
  onRemoveAttachment,
  onRemoveQueuedPrompt,
  onChangeText,
  onSelectSlashCommand,
  onWorkspaceScopeChange,
  onSend,
  onStop,
}: {
  activeModelPreset: string;
  colors: Palette;
  dark: boolean;
  value: string;
  goalState?: GoalStateWsPayload;
  inputRef: RefObject<TextInput | null>;
  modelName: string;
  mentionCandidates: CapabilityMentionCandidate[];
  skillCandidates: SkillMentionCandidate[];
  modelPresets: SettingsPayload['model_presets'];
  quotedContext: string | null;
  variant: 'hero' | 'thread';
  turnActive: boolean;
  disabled: boolean;
  workspaceScope: WorkspaceScopePayload | null;
  workspaceDefaultScope: WorkspaceScopePayload | null;
  workspaceControls: WorkspacesPayload['controls'] | null;
  workspaceError: string | null;
  workspaceScopeDisabled: boolean;
  attachments: ComposerAttachment[];
  attachmentBusy: boolean;
  attachmentFull: boolean;
  attachmentError: string | null;
  readyAttachmentCount: number;
  queuedPrompts: QueuedPrompt[];
  runStartedAt: number | null;
  slashCommands: ComposerSlashCommand[];
  voiceError: string | null;
  voiceRecorder: VoiceRecorderController;
  onAddAttachment: () => void;
  onClearQuote: () => void;
  onCursorChange: (cursor: number) => void;
  onMentionCandidateSelect: (candidate: CapabilityMentionCandidate) => void;
  onSkillCandidateSelect: (candidate: SkillMentionCandidate) => void;
  onModelPresetChange: (name: string) => Promise<void>;
  onOpenModelSettings: () => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveQueuedPrompt: (id: string) => void;
  onChangeText: (value: string) => void;
  onSelectSlashCommand: (command: ComposerSlashCommand) => void;
  onWorkspaceScopeChange: (scope: WorkspaceScopePayload) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const hasAttachments = readyAttachmentCount > 0;
  const hasDraft = Boolean(value.trim()) || Boolean(quotedContext?.trim()) || hasAttachments;
  const canSend =
    hasDraft &&
    !disabled &&
    !attachmentBusy &&
    !attachments.some((item) => item.status === 'error');
  const stopButton = turnActive && !hasDraft;
  const voiceBusy = voiceRecorder.phase !== 'idle';
  return (
    <View
      style={[
        styles.composer,
        variant === 'hero' ? styles.composerHero : styles.composerThread,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <RunGoalStatus colors={colors} dark={dark} goalState={goalState} runStartedAt={runStartedAt} />
      {mentionCandidates.length ? (
        <View style={[styles.slashPalette, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.mentionPaletteLabel, { color: colors.subtle }]}>{t('thread.composer.mentions.label')}</Text>
          <ScrollView
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.slashPaletteScroll}
          >
            {mentionCandidates.map((candidate) => {
              const item = candidate.kind === 'cli' ? candidate.app : candidate.preset;
              return (
                <Pressable
                  accessibilityLabel={t(candidate.kind === 'cli' ? 'thread.composer.mentions.cliDescription' : 'thread.composer.mentions.mcpDescription', { name: candidate.name })}
                  key={`${candidate.kind}-${candidate.name}`}
                  onPress={() => onMentionCandidateSelect(candidate)}
                  style={({ pressed }) => [
                    styles.slashCommandRow,
                    pressed && { backgroundColor: colors.pressed },
                  ]}
                >
                  <MentionCandidateLogo candidate={candidate} colors={colors} />
                  <View style={styles.slashCommandBody}>
                    <View style={styles.slashCommandTitleRow}>
                      <Text numberOfLines={1} style={[styles.slashCommandName, { color: colors.foreground }]}>
                        {item.display_name}
                      </Text>
                      <Text numberOfLines={1} style={[styles.slashCommandHint, { color: colors.subtle }]}>
                        @{candidate.name}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={[styles.slashCommandDescription, { color: colors.muted }]}>
                      {candidate.kind === 'cli' ? t('thread.composer.mentions.cliGroup') : t('thread.composer.mentions.mcpGroup')}
                    </Text>
                  </View>
                  <View style={[
                    styles.mentionKindBadge,
                    { backgroundColor: candidate.kind === 'cli' ? '#F9731618' : '#0EA5E918' },
                  ]}>
                    <Text style={[
                      styles.mentionKindText,
                      { color: candidate.kind === 'cli' ? '#D65B08' : '#087DA4' },
                    ]}>
                      {candidate.kind === 'cli' ? 'CLI' : 'MCP'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : skillCandidates.length ? (
        <View style={[styles.slashPalette, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ScrollView
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.slashPaletteScroll}
          >
            {skillCandidates.map((candidate) => (
              <Pressable
                accessibilityLabel={t('settings.skills.openDetails', { name: candidate.skill.name })}
                key={candidate.command}
                onPress={() => onSkillCandidateSelect(candidate)}
                style={({ pressed }) => [
                  styles.slashCommandRow,
                  pressed && { backgroundColor: colors.pressed },
                ]}
              >
                <View style={[styles.slashCommandIcon, { backgroundColor: colors.pressed }]}>
                  <Brain color={colors.muted} size={17} strokeWidth={1.8} />
                </View>
                <View style={styles.slashCommandBody}>
                  <Text style={[styles.slashCommandName, { color: colors.foreground }]}>
                    {candidate.skill.name}
                  </Text>
                  <Text numberOfLines={1} style={[styles.slashCommandDescription, { color: colors.muted }]}>
                    {candidate.skill.description || candidate.skill.name}
                  </Text>
                </View>
                {candidate.recent ? (
                  <View style={[styles.mentionKindBadge, { backgroundColor: colors.pressed }]}>
                    <Text style={[styles.mentionKindText, { color: colors.muted }]}>{t('thread.composer.slash.badges.recent')}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : slashCommands.length ? (
        <View style={[styles.slashPalette, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ScrollView
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.slashPaletteScroll}
          >
            {slashCommands.map((command) => (
              <Pressable
                accessibilityLabel={`${t('thread.composer.slash.ariaLabel')}: ${command.command}`}
                key={command.command}
                onPress={() => onSelectSlashCommand(command)}
                style={({ pressed }) => [
                  styles.slashCommandRow,
                  pressed && { backgroundColor: colors.pressed },
                ]}
              >
                <View style={[styles.slashCommandIcon, { backgroundColor: colors.pressed }]}>
                  <Text style={[styles.slashCommandIconText, { color: colors.muted }]}>/</Text>
                </View>
                <View style={styles.slashCommandBody}>
                  <View style={styles.slashCommandTitleRow}>
                    <Text style={[styles.slashCommandName, { color: colors.foreground }]}>
                      {command.command}
                    </Text>
                    {command.argHint ? (
                      <Text numberOfLines={1} style={[styles.slashCommandHint, { color: colors.subtle }]}>
                        {command.argHint}
                      </Text>
                    ) : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.slashCommandDescription, { color: colors.muted }]}>
                    {command.description || command.title}
                  </Text>
                </View>
                {command.recent ? (
                  <View style={[styles.mentionKindBadge, { backgroundColor: colors.pressed }]}>
                    <Text style={[styles.mentionKindText, { color: colors.muted }]}>{t('thread.composer.slash.badges.recent')}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {queuedPrompts.length ? (
        <View style={[styles.queuedPromptList, { borderBottomColor: colors.border }]}>
          <Text style={[styles.queuedPromptLabel, { color: colors.subtle }]}>{t('thread.composer.queued.label')}</Text>
          {queuedPrompts.map((prompt) => (
            <View key={prompt.id} style={[styles.queuedPromptRow, { backgroundColor: colors.pressed }]}>
              <Text numberOfLines={1} style={[styles.queuedPromptText, { color: colors.muted }]}>
                {queuedPromptPreview(prompt, t)}
              </Text>
              {prompt.attachments.length ? (
                <Text style={[styles.queuedPromptCount, { color: colors.subtle }]}>
                  +{prompt.attachments.length}
                </Text>
              ) : null}
              <Pressable
                accessibilityLabel={t('thread.composer.queued.delete')}
                hitSlop={7}
                onPress={() => onRemoveQueuedPrompt(prompt.id)}
                style={styles.queuedPromptRemove}
              >
                <X color={colors.subtle} size={13} strokeWidth={2} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {quotedContext ? (
        <View style={[styles.composerQuote, { borderBottomColor: colors.border, backgroundColor: colors.pressed }]}>
          <Quote color={colors.subtle} size={14} strokeWidth={1.8} />
          <View style={styles.composerQuoteBody}>
            <Text style={[styles.composerQuoteLabel, { color: colors.subtle }]}>{t('thread.composer.quotedContext')}</Text>
            <Text numberOfLines={3} style={[styles.composerQuoteText, { color: colors.muted }]}>
              {quotedContext}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={t('thread.composer.removeQuotedContext')}
            hitSlop={7}
            onPress={onClearQuote}
            style={styles.composerQuoteClose}
          >
            <X color={colors.subtle} size={15} strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}
      {attachments.length ? (
        <ScrollView
          contentContainerStyle={styles.attachmentList}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
        >
          {attachments.map((attachment) => (
            <AttachmentChip
              attachment={attachment}
              colors={colors}
              key={attachment.id}
              onRemove={() => onRemoveAttachment(attachment.id)}
            />
          ))}
        </ScrollView>
      ) : null}
      {attachmentError ? (
        <Text style={[styles.attachmentError, { color: colors.errorText }]}>{attachmentError}</Text>
      ) : null}
      {voiceError ? (
        <Text selectable style={[styles.voiceError, { color: colors.errorText }]}>{voiceError}</Text>
      ) : null}
      <TextInput
        ref={inputRef}
        accessibilityLabel={t('thread.composer.inputAria')}
        editable={!disabled && !voiceBusy}
        maxLength={65_536}
        multiline
        onChangeText={onChangeText}
        onSelectionChange={(event) => onCursorChange(event.nativeEvent.selection.start)}
        placeholder={turnActive ? t('thread.composer.placeholderStreaming') : variant === 'hero' ? t('thread.composer.placeholderHero') : t('thread.composer.placeholderThread')}
        placeholderTextColor={colors.subtle}
        style={[
          styles.composerInput,
          variant === 'hero' && styles.composerInputHero,
          { color: colors.foreground },
        ]}
        textAlignVertical="top"
        value={value}
      />
      <View style={styles.composerToolbar}>
        <View style={styles.composerToolbarLeft}>
          <Pressable
            accessibilityLabel={t('thread.composer.attachImage')}
            disabled={disabled || attachmentFull}
            hitSlop={6}
            onPress={onAddAttachment}
            style={[styles.roundIconButton, (disabled || attachmentFull) && styles.sendButtonDisabled]}
          >
            <Paperclip color={colors.muted} size={17} strokeWidth={1.8} />
          </Pressable>
          {voiceRecorder.phase === 'recording' ? (
            <View style={styles.voiceMeter}>
              <View style={styles.voiceWaveform}>
                {voiceRecorder.waveform.map((level, index) => (
                  <View
                    key={index}
                    style={[
                      styles.voiceWaveBar,
                      {
                        backgroundColor: '#E5484D',
                        height: Math.max(3, Math.round(level * 20)),
                      },
                    ]}
                  />
                ))}
              </View>
              <Text selectable style={[styles.voiceDuration, { color: colors.muted }]}>
                {formatVoiceDuration(voiceRecorder.elapsedMs)}
              </Text>
            </View>
          ) : (
            <>
              {workspaceScope ? (
                <WorkspaceAccessMenu
                  canUseFullAccess={workspaceControls?.can_use_full_access !== false}
                  colors={colors}
                  disabled={disabled || workspaceScopeDisabled}
                  isHero={variant === 'hero'}
                  onChange={onWorkspaceScopeChange}
                  scope={workspaceScope}
                />
              ) : null}
              <ModelPresetMenu
                activePreset={activeModelPreset}
                colors={colors}
                disabled={disabled}
                displayLabel={modelName}
                onOpenSettings={onOpenModelSettings}
                onPresetChange={onModelPresetChange}
                presets={modelPresets}
              />
            </>
          )}
        </View>
        <View style={styles.composerToolbarRight}>
          {!turnActive ? (
            <Pressable
              accessibilityLabel={voiceRecorder.phase === 'recording' ? t('thread.composer.voice.stop') : t('thread.composer.tools.voice')}
              delayLongPress={140}
              disabled={voiceRecorder.disabled}
              hitSlop={6}
              onLongPress={voiceRecorder.onLongPress}
              onPress={voiceRecorder.onPress}
              onPressOut={voiceRecorder.onPressOut}
              style={[
                styles.roundIconButton,
                voiceRecorder.phase === 'recording' && styles.voiceRecordingButton,
                voiceRecorder.disabled && styles.sendButtonDisabled,
              ]}
            >
              {voiceRecorder.phase === 'transcribing'
                ? <ActivityIndicator color={colors.muted} size="small" />
                : voiceRecorder.phase === 'recording'
                  ? <Square color="#FFFFFF" fill="#FFFFFF" size={10} />
                  : <Mic color={colors.muted} size={17} strokeWidth={1.8} />}
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={stopButton ? t('thread.composer.stop') : t('thread.composer.send')}
            disabled={!stopButton && !canSend}
            onPress={stopButton ? onStop : onSend}
            style={[
              styles.sendButton,
              { backgroundColor: colors.foreground },
              !stopButton && !canSend && styles.sendButtonDisabled,
            ]}
          >
            {stopButton
              ? <Square color={colors.background} fill={colors.background} size={10} />
              : disabled || attachmentBusy
                ? <ActivityIndicator color={colors.background} size="small" />
                : <ArrowUp color={colors.background} size={18} strokeWidth={2.3} />}
          </Pressable>
        </View>
      </View>
      <WorkspaceProjectPicker
        colors={colors}
        controls={workspaceControls}
        defaultScope={workspaceDefaultScope}
        disabled={disabled || workspaceScopeDisabled}
        error={workspaceError}
        isHero={variant === 'hero'}
        onChange={onWorkspaceScopeChange}
        scope={workspaceScope}
      />
    </View>
  );
}

function AttachmentChip({
  attachment,
  colors,
  onRemove,
}: {
  attachment: ComposerAttachment;
  colors: Palette;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.attachmentChip, { borderColor: colors.border, backgroundColor: colors.pressed }]}>
      {attachment.kind === 'image' ? (
        <ExpoImage contentFit="cover" source={{ uri: attachment.uri }} style={styles.attachmentThumb} />
      ) : (
        <View style={[styles.attachmentFileIcon, { backgroundColor: colors.card }]}>
          <FileText color={colors.muted} size={18} strokeWidth={1.7} />
        </View>
      )}
      <View style={styles.attachmentLabelArea}>
        <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.foreground }]}>
          {attachment.name}
        </Text>
        <Text numberOfLines={1} style={[styles.attachmentStatus, { color: attachment.status === 'error' ? colors.errorText : colors.muted }]}>
          {attachment.status === 'encoding'
            ? t('thread.composer.encoding')
            : attachment.status === 'error'
              ? attachment.error || t('thread.composer.imageRejected.io')
              : formatAttachmentBytes(attachment.encodedBytes ?? attachment.size)}
        </Text>
      </View>
      {attachment.status === 'encoding' ? (
        <ActivityIndicator color={colors.muted} size="small" />
      ) : null}
      <Pressable accessibilityLabel={`${t('thread.composer.remove')}: ${attachment.name}`} hitSlop={7} onPress={onRemove}>
        <X color={colors.muted} size={14} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function MentionCandidateLogo({
  candidate,
  colors,
}: {
  candidate: CapabilityMentionCandidate;
  colors: Palette;
}) {
  const item = candidate.kind === 'cli' ? candidate.app : candidate.preset;
  const rawLogoUrl = item.logo_url?.trim() || null;
  const logoUrls = useMemo(() => logoFallbackUrls(rawLogoUrl), [rawLogoUrl]);
  const { logoUrl, onLogoError, onLogoLoad } = useLogoFallback(logoUrls);
  const initials = (item.display_name || item.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || item.name.slice(0, 2).toUpperCase();

  if (logoUrl) {
    return (
      <ExpoImage
        accessibilityLabel={item.display_name || item.name}
        contentFit="contain"
        onError={onLogoError}
        onLoad={onLogoLoad}
        source={{ uri: logoUrl }}
        style={styles.mentionLogo}
        transition={0}
      />
    );
  }

  return (
    <View style={[
      styles.mentionLogoFallback,
      { backgroundColor: item.brand_color || colors.pressed },
    ]}>
      <Text style={[styles.mentionLogoText, { color: item.brand_color ? '#FFFFFF' : colors.foreground }]}>
        {initials}
      </Text>
    </View>
  );
}

function queuedPromptPreview(prompt: QueuedPrompt, t: ReturnType<typeof useTranslation>['t']): string {
  const parsed = parseQuotedUserMessage(prompt.text);
  if (parsed.content.trim()) return parsed.content;
  if (parsed.quotedContext || prompt.options?.quotedContext?.trim()) return t('thread.composer.quotedContext');
  return prompt.attachments.length
    ? `${prompt.attachments.length} · ${t('thread.composer.attachImage')}`
    : t('thread.composer.queued.guide');
}

function formatAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MessageRow({
  message,
  colors,
  dark,
  codeWrap,
  cliApps,
  mcpPresets,
  slashCommands,
  forkIndex,
  forkBusy,
  canRetry,
  isRetryBusy,
  onFork,
  onRetry,
  onOpenFilePreview,
  onQuote,
  resolveFilePreviewAvailability,
}: {
  canRetry: boolean;
  isRetryBusy: boolean;
  onRetry: () => void | Promise<void>;

  message: UIMessage;
  colors: Palette;
  dark: boolean;
  codeWrap: boolean;
  cliApps: CliAppInfo[];
  mcpPresets: McpPresetInfo[];
  slashCommands: SlashCommand[];
  forkIndex?: number;
  forkBusy: boolean;
  onFork: (beforeUserIndex: number) => void;
  onOpenFilePreview?: (path: string) => void;
  onQuote: (content: string) => void;
  resolveFilePreviewAvailability?: (path: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  const assistant = message.role === 'assistant';
  const parsedUser = assistant ? null : parseQuotedUserMessage(message.content);
  const visibleContent = parsedUser?.content ?? message.content;
  const hasContent = visibleContent.trim().length > 0;
  const hasMedia = Boolean(message.images?.length || message.media?.length);
  const automationKind = message.source?.kind;
  const automationSource = assistant && (
    automationKind === 'cron'
    || automationKind === 'local_trigger'
    || automationKind === 'trigger'
  )
    ? message.source?.label?.trim() || t('message.automationSourceFallback')
    : '';
  const completedAtLabel = assistant && !message.isStreaming
    ? formatMessageEndTime(message.completedAt)
    : '';
  const showAssistantActions = assistant && !message.isStreaming && hasContent;
  const showUserCopy = !assistant && hasContent;

  return (
    <View style={[styles.messageRow, assistant ? styles.assistantRow : styles.userRow]}>
      <View
        style={[
          assistant ? styles.assistantBubble : styles.userMessageStack,
          !assistant && { alignItems: 'flex-end' },
        ]}
      >
        {assistant && message.reasoning ? (
          <ReasoningBubble
            colors={colors}
            createdAt={message.createdAt}
            latencyMs={message.latencyMs}
            streaming={Boolean(message.reasoningStreaming)}
            text={message.reasoning}
          />
        ) : null}
        {!assistant && hasMedia ? (
          <MessageMediaGallery
            align="right"
            colors={colors}
            images={message.images}
            media={message.images?.length ? [] : message.media}
          />
        ) : null}
        {!assistant && parsedUser?.quotedContext ? (
          <View style={[styles.quotedContext, { borderLeftColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.quotedContextHeader}>
              <Quote color={colors.subtle} size={12} strokeWidth={1.8} />
              <Text style={[styles.quotedContextLabel, { color: colors.subtle }]}>{t('thread.composer.quotedContext')}</Text>
            </View>
            <Text numberOfLines={6} selectable style={[styles.quotedContextText, { color: colors.muted }]}>
              {parsedUser.quotedContext}
            </Text>
          </View>
        ) : null}
        {automationSource ? (
          <View style={[styles.automationBadge, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.automationBadgeText, { color: colors.muted }]}>{t('message.automationTriggered')} · {automationSource}</Text>
          </View>
        ) : null}
        {hasContent ? (
          assistant ? (
            <MarkdownText
              codeWrap={codeWrap}
              colors={colors}
              dark={dark}
              onOpenFilePreview={onOpenFilePreview}
              resolveFilePreviewAvailability={resolveFilePreviewAvailability}
              streaming={Boolean(message.isStreaming)}
            >
              {visibleContent}
            </MarkdownText>
          ) : (
            <View style={[styles.userBubble, { backgroundColor: colors.userBubble }]}>
              <UserMessageBody
                cliApps={cliApps}
                colors={colors}
                content={visibleContent}
                mcpPresets={mcpPresets}
                message={message}
                slashCommands={slashCommands}
              />
            </View>
          )
        ) : message.isStreaming ? (
          <View style={styles.streamingDots}>
            <View style={[styles.streamingDot, { backgroundColor: colors.subtle }]} />
            <View style={[styles.streamingDot, { backgroundColor: colors.subtle }]} />
            <View style={[styles.streamingDot, { backgroundColor: colors.subtle }]} />
          </View>
        ) : null}
        {assistant && hasMedia ? (
          <MessageMediaGallery
            align="left"
            colors={colors}
            images={message.images}
            media={message.media}
          />
        ) : null}
        {showAssistantActions || completedAtLabel ? (
          <View style={styles.messageActions}>
            {showAssistantActions ? <MessageCopyButton colors={colors} content={message.content} /> : null}
            {showAssistantActions ? (
              <Pressable
                accessibilityLabel={t('message.askAboutSelection')}
                hitSlop={7}
                onPress={() => onQuote(markdownToSelectableText(message.content))}
                style={({ pressed }) => [
                  styles.messageActionButton,
                  pressed && { backgroundColor: colors.pressed },
                ]}
              >
                <Quote color={colors.subtle} size={15} strokeWidth={1.8} />
              </Pressable>
            ) : null}
            {showAssistantActions && forkIndex !== undefined ? (
              <Pressable
                accessibilityLabel={t('message.forkFromHere')}
                disabled={forkBusy}
                hitSlop={7}
                onPress={() => onFork(forkIndex)}
                style={({ pressed }) => [
                  styles.messageActionButton,
                  pressed && { backgroundColor: colors.pressed },
                ]}
              >
                {forkBusy
                  ? <ActivityIndicator color={colors.subtle} size={15} />
                  : <GitFork color={colors.subtle} size={15} strokeWidth={1.8} />}
              </Pressable>
            ) : null}
            {showAssistantActions && canRetry ? (
              <Pressable
                accessibilityLabel={t('message.retry', { defaultValue: 'Retry' })}
                disabled={isRetryBusy}
                hitSlop={7}
                onPress={() => void onRetry()}
                style={({ pressed }) => [
                  styles.messageActionButton,
                  pressed && { backgroundColor: colors.pressed },
                ]}
              >
                {isRetryBusy
                  ? <ActivityIndicator color={colors.subtle} size={15} />
                  : <RotateCw color={colors.subtle} size={15} strokeWidth={1.8} />}
              </Pressable>
            ) : null}
            {completedAtLabel ? (
              <Text
                accessibilityLabel={`${t('message.turnLatencyTitle')}: ${formatDateTime(message.completedAt)}`}
                style={[styles.completedAt, { color: colors.subtle }]}
              >
                {completedAtLabel}
              </Text>
            ) : null}
          </View>
        ) : showUserCopy ? (
          <View style={styles.userMessageActions}>
            <MessageCopyButton colors={colors} content={message.content} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function UserMessageBody({
  cliApps,
  colors,
  content,
  mcpPresets,
  message,
  slashCommands,
}: {
  cliApps: CliAppInfo[];
  colors: Palette;
  content: string;
  mcpPresets: McpPresetInfo[];
  message: UIMessage;
  slashCommands: SlashCommand[];
}) {
  const command = matchingSlashCommand(content, slashCommands);
  const attachedCliNames = new Set((message.cliApps ?? []).map((item) => item.name.toLowerCase()));
  const attachedMcpNames = new Set((message.mcpPresets ?? []).map((item) => item.name.toLowerCase()));
  const cliByName = new Map(cliApps.map((item) => [item.name.toLowerCase(), item]));
  const mcpByName = new Map(mcpPresets.map((item) => [item.name.toLowerCase(), item]));
  const tokenPattern = /(^|[\s([{])(\$[A-Za-z0-9_-]+|@[A-Za-z0-9_-]+)|(^\/[^\s]+)/g;
  const segments: Array<{ text: string; tone?: string }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(content)) !== null) {
    const raw = match[2] || match[3] || '';
    const tokenStart = match.index + (match[1]?.length ?? 0);
    if (tokenStart > cursor) segments.push({ text: content.slice(cursor, tokenStart) });
    let tone: string | undefined;
    if (raw.startsWith('$')) tone = '#6D5DF6';
    if (raw.startsWith('/')) tone = command?.command === raw ? '#6D5DF6' : undefined;
    if (raw.startsWith('@')) {
      const name = raw.slice(1).toLowerCase();
      const cli = cliByName.get(name);
      const mcp = mcpByName.get(name);
      if (cli?.installed || attachedCliNames.has(name)) tone = cli?.brand_color || '#0891B2';
      else if ((mcp?.installed && mcp.configured) || attachedMcpNames.has(name)) {
        tone = mcp?.brand_color || '#6D5DF6';
      }
    }
    segments.push({ text: raw, tone });
    cursor = tokenStart + raw.length;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });
  if (!segments.length) segments.push({ text: content });

  return (
    <Text selectable style={[styles.messageText, { color: colors.userText }]}>
      {segments.map((segment, index) => segment.tone ? (
        <Text
          key={`${segment.text}-${index}`}
          style={[
            styles.inlineToken,
            { color: segment.tone, backgroundColor: translucentTokenColor(segment.tone) },
          ]}
        >
          {segment.text}
        </Text>
      ) : <Text key={`${segment.text}-${index}`}>{segment.text}</Text>)}
    </Text>
  );
}

function translucentTokenColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}1F` : 'rgba(109,93,246,0.12)';
}

function ForkBoundaryDivider({ colors }: { colors: Palette }) {
  const { t } = useTranslation();
  return (
    <View style={styles.forkBoundary}>
      <View style={[styles.forkBoundaryLine, { backgroundColor: colors.border }]} />
      <Text style={[styles.forkBoundaryText, { color: colors.subtle }]}>{t('thread.forkedFromHistory')}</Text>
      <View style={[styles.forkBoundaryLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

function MessageCopyButton({ colors, content }: { colors: Palette; content: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(content);
    setCopied(true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <Pressable
      accessibilityLabel={copied ? t('message.copiedReply') : t('message.copyReply')}
      hitSlop={7}
      onPress={() => void copy()}
      style={({ pressed }) => [styles.messageActionButton, pressed && { backgroundColor: colors.pressed }]}
    >
      {copied
        ? <Check color={colors.subtle} size={15} strokeWidth={2} />
        : <Copy color={colors.subtle} size={15} strokeWidth={1.8} />}
    </Pressable>
  );
}

const LIGHT_COLORS: Palette = {
  background: '#FCFCFB',
  foreground: '#23221F',
  muted: '#777570',
  subtle: '#A09E98',
  border: '#DDDCD8',
  card: '#FFFFFF',
  userBubble: '#EFEDEA',
  userText: '#2C2B28',
  pressed: '#EFEEEB',
  errorBackground: '#FBE9E6',
  errorText: '#A73A31',
};

const DARK_COLORS: Palette = {
  background: '#171715',
  foreground: '#F0EFEC',
  muted: '#A9A7A1',
  subtle: '#77756F',
  border: '#3B3A36',
  card: '#222220',
  userBubble: '#302F2C',
  userText: '#F1F0ED',
  pressed: '#2A2926',
  errorBackground: '#432520',
  errorText: '#F0A39B',
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 11,
  },
  headerButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { minWidth: 0, flex: 1, fontSize: 12, fontWeight: '500' },
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
  threadListArea: { minHeight: 0, flex: 1 },
  messagesContent: { flexGrow: 1, paddingHorizontal: 15, paddingTop: 12 },
  scrollToBottomButton: {
    position: 'absolute',
    right: 16,
    bottom: 10,
    width: 38,
    height: 38,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 9,
    elevation: 5,
  },
  loadOlderButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  loadOlderText: { fontSize: 12, fontWeight: '500' },
  activityRow: { width: '100%', marginVertical: 5, paddingHorizontal: 5 },
  messageRow: { width: '100%', marginVertical: 7 },
  assistantRow: { alignItems: 'flex-start' },
  userRow: { alignItems: 'flex-end' },
  assistantBubble: { width: '100%', maxWidth: '100%', paddingHorizontal: 5, paddingVertical: 5 },
  userMessageStack: { maxWidth: '86%' },
  userBubble: { maxWidth: '100%', borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  quotedContext: { width: '100%', marginBottom: 7, borderLeftWidth: 2, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  quotedContextHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  quotedContextLabel: { fontSize: 10, fontWeight: '700' },
  quotedContextText: { fontSize: 12, lineHeight: 17 },
  automationBadge: { alignSelf: 'flex-start', marginBottom: 7, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4 },
  automationBadgeText: { fontSize: 10.5, fontWeight: '600' },
  messageText: { fontSize: 15.5, lineHeight: 23 },
  inlineToken: { fontWeight: '600', borderRadius: 4 },
  messageActions: { minHeight: 32, marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 2 },
  userMessageActions: { minHeight: 32, alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center' },
  completedAt: { marginLeft: 4, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  messageActionButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  forkBoundary: { marginVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  forkBoundaryLine: { height: StyleSheet.hairlineWidth, flex: 1 },
  forkBoundaryText: { fontSize: 11 },
  streamingDots: { height: 22, flexDirection: 'row', alignItems: 'center', gap: 4 },
  streamingDot: { width: 5, height: 5, borderRadius: 3 },
  threadComposer: { paddingHorizontal: 10, paddingTop: 5 },
  composer: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  composerHero: { minHeight: 118, borderRadius: 24, paddingTop: 4 },
  composerThread: { minHeight: 82, borderRadius: 22, paddingTop: 2 },
  slashPalette: { maxHeight: 264, borderBottomWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  slashPaletteScroll: { maxHeight: 264 },
  mentionPaletteLabel: { paddingHorizontal: 12, paddingTop: 9, paddingBottom: 3, fontSize: 11, fontWeight: '700' },
  mentionLogo: { width: 32, height: 32, borderRadius: 9 },
  mentionLogoFallback: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  mentionLogoText: { fontSize: 10, fontWeight: '800' },
  mentionKindBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  mentionKindText: { fontSize: 9.5, fontWeight: '800' },
  slashCommandRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 8 },
  slashCommandIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  slashCommandIconText: { fontSize: 17, fontWeight: '700' },
  slashCommandBody: { minWidth: 0, flex: 1, gap: 2 },
  slashCommandTitleRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  slashCommandName: { fontSize: 13, fontWeight: '600' },
  slashCommandHint: { minWidth: 0, flexShrink: 1, fontSize: 11 },
  slashCommandDescription: { fontSize: 11.5, lineHeight: 16 },
  queuedPromptList: { gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 7 },
  queuedPromptLabel: { paddingHorizontal: 2, fontSize: 10, fontWeight: '600' },
  queuedPromptRow: { minHeight: 30, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 9, paddingRight: 4 },
  queuedPromptText: { minWidth: 0, flex: 1, fontSize: 11.5 },
  queuedPromptCount: { fontSize: 10, fontVariant: ['tabular-nums'] },
  queuedPromptRemove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  composerQuote: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  composerQuoteBody: { minWidth: 0, flex: 1 },
  composerQuoteLabel: { fontSize: 10.5, fontWeight: '700' },
  composerQuoteText: { marginTop: 2, fontSize: 11.5, lineHeight: 16 },
  composerQuoteClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginTop: -3, marginRight: -4 },
  attachmentList: { gap: 8, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 2 },
  attachmentChip: { width: 188, minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 5, flexDirection: 'row', alignItems: 'center', gap: 7 },
  attachmentThumb: { width: 42, height: 42, borderRadius: 8 },
  attachmentFileIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  attachmentLabelArea: { minWidth: 0, flex: 1 },
  attachmentName: { fontSize: 12, fontWeight: '600' },
  attachmentStatus: { marginTop: 2, fontSize: 10 },
  attachmentError: { paddingHorizontal: 14, paddingTop: 7, fontSize: 11, lineHeight: 15 },
  voiceError: { paddingHorizontal: 14, paddingTop: 7, fontSize: 11, lineHeight: 15 },
  composerInput: { minHeight: 40, maxHeight: 145, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 5, fontSize: 16, lineHeight: 22 },
  composerInputHero: { minHeight: 62, paddingHorizontal: 17, paddingTop: 16 },
  composerToolbar: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 7 },
  composerToolbarLeft: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  composerToolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  roundIconButton: { width: 33, height: 33, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  modelBadge: { minWidth: 0, maxWidth: 180, height: 29, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 15, paddingHorizontal: 10 },
  modelText: { minWidth: 0, flexShrink: 1, fontSize: 11.5, fontWeight: '500' },
  voiceMeter: { minWidth: 0, flex: 1, height: 29, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  voiceWaveform: { minWidth: 0, flex: 1, height: 22, flexDirection: 'row', alignItems: 'center', gap: 2 },
  voiceWaveBar: { width: 2.5, borderRadius: 2 },
  voiceDuration: { width: 34, fontSize: 11, fontVariant: ['tabular-nums'], textAlign: 'right' },
  voiceRecordingButton: { backgroundColor: '#E5484D' },
  sendButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.24 },
});
