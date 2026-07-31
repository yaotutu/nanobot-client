import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDashed,
  Clock3,
  ExternalLink,
  FilePenLine,
  FileSearch,
  FolderOpen,
  Globe2,
  ListTree,
  MemoryStick,
  Play,
  Search,
  Server,
  Terminal,
  Wrench,
} from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLogoFallback } from '@/hooks/use-logo-fallback';
import i18n from '@/i18n';
import { isReasoningOnlyAssistant } from '@/lib/activity-timeline';
import { coalesceActivityMessages } from '@/lib/activity-message-model';
import {
  compactActivityPath,
  redactActivityText,
  redactShellCommand,
  safeActivityDetail,
} from '@/lib/activity-text';
import {
  countDiffLines,
  countSkippedUnchangedLines,
  parseRenderableFileDiff,
  type RenderableFileDiff,
  type RenderableFileDiffHunk,
} from '@/lib/file-diff';
import {
  canGroupGenericToolRuns,
  describeGenericToolRun,
  parseGenericToolTrace,
  type GenericToolRunItem,
  type GenericToolStatus,
} from '@/lib/generic-tool-model';
import { describeMcpActivity } from '@/lib/mcp-activity-model';
import { describeTraceLine } from '@/lib/trace-activity-model';
import { canonicalToolTrace, formatToolCallTrace } from '@/lib/tool-traces';
import {
  presentWebSearchAction,
  webSearchRunsByTraceLine,
} from '@/lib/web-search-model';
import { browserSafeFaviconUrls } from '@/lib/web-url';
import type { FileEditDisplayMode, LocalActivityMode } from '@/lib/local-preferences';
import { logoFallbackUrls } from '@/lib/provider-brand';
import type {
  CliAppInfo,
  McpPresetInfo,
  ToolProgressEvent,
  UIFileEdit,
  UIMessage,
} from '@/types/nanobot';

interface ActivityPalette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
  errorBackground: string;
  errorText: string;
}

interface AgentActivityClusterProps {
  cliApps?: CliAppInfo[];
  colors: ActivityPalette;
  hasBodyBelow: boolean;
  isTurnStreaming: boolean;
  messages: UIMessage[];
  mcpPresets?: McpPresetInfo[];
  onOpenFilePreview?: (path: string) => void;
  resolveFilePreviewAvailability?: (path: string) => Promise<boolean>;
  startedAtMs?: number;
  turnLatencyMs?: number;
  activityMode?: LocalActivityMode;
  fileEditDisplayMode?: FileEditDisplayMode;
}

type ToolStatus = 'running' | 'done' | 'error';

interface ToolRowModel {
  brand?: CapabilityBrand;
  key: string;
  label: string;
  detail?: string;
  icon?: 'clock' | 'file-search' | 'folder' | 'list' | 'memory' | 'play' | 'search' | 'server' | 'web' | 'tool';
  status: ToolStatus;
  url?: string;
  webHost?: string;
}

interface CapabilityBrand {
  color: string;
  fallback: 'server' | 'terminal';
  initials?: string;
  logoUrls?: string[];
}

const FILE_EDIT_TOOL_NAMES = new Set(['write_file', 'edit_file', 'apply_patch']);
const ACTIVITY_SCROLL_NEAR_BOTTOM_PX = 24;

export function AgentActivityCluster({
  cliApps = [],
  colors,
  hasBodyBelow,
  isTurnStreaming,
  messages,
  mcpPresets = [],
  onOpenFilePreview,
  resolveFilePreviewAvailability,
  startedAtMs,
  turnLatencyMs,
  activityMode = 'auto',
  fileEditDisplayMode = 'summary',
}: AgentActivityClusterProps) {
  const { t } = useTranslation();
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [completionHoldOpen, setCompletionHoldOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wasStreamingRef = useRef(isTurnStreaming);
  const activityScrollRef = useRef<ScrollView>(null);
  const autoFollowActivityRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const activityMessages = useMemo(() => coalesceActivityMessages(messages), [messages]);
  const cliAppsByName = useMemo(
    () => new Map(cliApps.map((app) => [app.name.toLowerCase(), app])),
    [cliApps],
  );
  const mcpPresetsByName = useMemo(
    () => new Map(mcpPresets.map((preset) => [preset.name.toLowerCase(), preset])),
    [mcpPresets],
  );
  const fileEdits = useMemo(
    () => summarizeFileEdits(collectFileEdits(activityMessages), isTurnStreaming),
    [activityMessages, isTurnStreaming],
  );
  const hasReasoning = activityMessages.some(isReasoningOnlyAssistant);
  const hasToolActivity = activityMessages.some(
    (message) => traceLines(message).length || message.toolEvents?.length,
  );
  const hasNonReasoningActivity = hasToolActivity || fileEdits.length > 0;
  const hasOnlyFileActivity = fileEdits.length > 0
    && activityMessages.every(messageHasOnlyFileActivity);
  const expanded = manualExpanded ?? (activityMode === 'expanded' || isTurnStreaming || completionHoldOpen);

  const cancelActivityScrollFrame = useCallback(() => {
    if (scrollFrameRef.current === null) return;
    cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
  }, []);

  const scheduleActivityScrollToBottom = useCallback(() => {
    cancelActivityScrollFrame();
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      activityScrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [cancelActivityScrollFrame]);

  const toggleExpanded = useCallback(() => {
    const nextExpanded = !expanded;
    if (nextExpanded) autoFollowActivityRef.current = true;
    setManualExpanded(nextExpanded);
  }, [expanded]);

  const handleActivityScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - contentOffset.y - layoutMeasurement.height;
    autoFollowActivityRef.current = distance < ACTIVITY_SCROLL_NEAR_BOTTOM_PX;
  }, []);

  useEffect(() => {
    if (!isTurnStreaming) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [isTurnStreaming]);

  useEffect(() => {
    if (!expanded) {
      autoFollowActivityRef.current = true;
      return;
    }
    if (autoFollowActivityRef.current) scheduleActivityScrollToBottom();
  }, [activityMessages, expanded, fileEdits, isTurnStreaming, scheduleActivityScrollToBottom]);

  useEffect(() => cancelActivityScrollFrame, [cancelActivityScrollFrame]);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isTurnStreaming;
    if (isTurnStreaming) {
      const reset = setTimeout(() => setCompletionHoldOpen(false), 0);
      return () => clearTimeout(reset);
    }
    if (!wasStreaming || manualExpanded !== null) return;
    const hold = setTimeout(() => setCompletionHoldOpen(true), 0);
    const collapse = setTimeout(() => setCompletionHoldOpen(false), 900);
    return () => {
      clearTimeout(hold);
      clearTimeout(collapse);
    };
  }, [isTurnStreaming, manualExpanded]);

  if (!hasReasoning && !hasNonReasoningActivity) return null;

  if (hasOnlyFileActivity) {
    return (
      <View style={[styles.container, hasBodyBelow && styles.withBodyBelow]}>
        <FileEditGroup
          colors={colors}
          displayMode={fileEditDisplayMode}
          edits={fileEdits}
          onOpenFilePreview={onOpenFilePreview}
          resolveFilePreviewAvailability={resolveFilePreviewAvailability}
        />
      </View>
    );
  }

  const durationMs = activityDurationMs(
    activityMessages,
    isTurnStreaming,
    now,
    turnLatencyMs,
    startedAtMs,
  );
  const duration = formatDuration(durationMs);
  const label = hasNonReasoningActivity
    ? isTurnStreaming
      ? t('message.activityWorkingFor', { duration })
      : durationMs > 0
        ? t('message.activityWorkedFor', { duration })
        : t('message.activityWorked')
    : isTurnStreaming
      ? t('message.activityThinkingFor', { duration })
      : durationMs > 0
        ? t('message.activityThoughtFor', { duration })
        : t('message.activityThought');

  return (
    <View style={[styles.container, hasBodyBelow && styles.withBodyBelow]}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggleExpanded}
        style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.pressed }]}
      >
        <Text
          numberOfLines={1}
          style={[styles.headerLabel, { color: isTurnStreaming ? colors.muted : colors.subtle }]}
        >
          {label}
        </Text>
        <ChevronDown
          color={colors.subtle}
          size={13}
          strokeWidth={1.8}
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {expanded ? (
        <ScrollView
          contentContainerStyle={styles.timelineContent}
          nestedScrollEnabled
          onContentSizeChange={() => {
            if (autoFollowActivityRef.current) scheduleActivityScrollToBottom();
          }}
          onScroll={handleActivityScroll}
          ref={activityScrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.timeline}
        >
          {activityMessages.map((message, index) => (
            <ActivityMessage
              active={isTurnStreaming && index === activityMessages.length - 1}
              cliAppsByName={cliAppsByName}
              colors={colors}
              key={message.id}
              message={message}
              mcpPresetsByName={mcpPresetsByName}
            />
          ))}
          {fileEdits.length ? (
            <FileEditGroup
              colors={colors}
              displayMode={fileEditDisplayMode}
              edits={fileEdits}
              onOpenFilePreview={onOpenFilePreview}
              resolveFilePreviewAvailability={resolveFilePreviewAvailability}
            />
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

function ActivityMessage({
  active,
  cliAppsByName,
  colors,
  message,
  mcpPresetsByName,
}: {
  active: boolean;
  cliAppsByName: Map<string, CliAppInfo>;
  colors: ActivityPalette;
  message: UIMessage;
  mcpPresetsByName: Map<string, McpPresetInfo>;
}) {
  const { t } = useTranslation();
  if (isReasoningOnlyAssistant(message)) {
    const preview = compactReasoningPreview(message.reasoning ?? '')
      || (active ? t('message.reasoningStreaming') : t('message.reasoningSummary'));
    return (
      <ActivityStep
        active={active && Boolean(message.reasoningStreaming)}
        colors={colors}
        label={preview}
        status={active && message.reasoningStreaming ? 'running' : 'done'}
        variant="reasoning"
      />
    );
  }
  if (message.kind !== 'trace') return null;
  const rows = toolRows(message, active, cliAppsByName, mcpPresetsByName);
  return (
    <View>
      {rows.map((row) => (
        <ActivityStep
          active={row.status === 'running'}
          brand={row.brand}
          colors={colors}
          detail={row.detail}
          icon={row.icon}
          key={row.key}
          label={row.label}
          status={row.status}
          url={row.url}
          variant="tool"
          webHost={row.webHost}
        />
      ))}
    </View>
  );
}

function ActivityStep({
  active,
  brand,
  colors,
  detail,
  icon = 'tool',
  label,
  status,
  url,
  variant,
  webHost,
}: {
  active: boolean;
  brand?: CapabilityBrand;
  colors: ActivityPalette;
  detail?: string;
  icon?: ToolRowModel['icon'];
  label: string;
  status: ToolStatus;
  url?: string;
  variant: 'reasoning' | 'tool';
  webHost?: string;
}) {
  const { t } = useTranslation();
  const tone = status === 'error' ? colors.errorText : colors.muted;
  const StepIcon = icon === 'clock'
    ? Clock3
    : icon === 'file-search'
      ? FileSearch
      : icon === 'folder'
        ? FolderOpen
        : icon === 'list'
          ? ListTree
          : icon === 'memory'
            ? MemoryStick
            : icon === 'play'
              ? Play
              : icon === 'search'
                ? Search
                : icon === 'web'
                  ? Globe2
                  : icon === 'server'
                    ? Server
                    : Wrench;
  return (
    <Pressable
      accessibilityHint={url ? t('message.openInBrowser', { defaultValue: 'Open in browser' }) : undefined}
      accessibilityRole={url ? 'link' : undefined}
      disabled={!url}
      onPress={url ? () => void Linking.openURL(url).catch(() => undefined) : undefined}
      style={({ pressed }) => [styles.step, pressed && { backgroundColor: colors.pressed }]}
    >
      <View style={styles.marker}>
        {brand ? (
          <CapabilityBrandMark active={active} brand={brand} colors={colors} />
        ) : icon === 'web' && webHost ? (
          <WebFavicon active={active} colors={colors} host={webHost} />
        ) : active ? (
          <ActivityIndicator color={colors.subtle} size={13} />
        ) : status === 'error' ? (
          <AlertCircle color={colors.errorText} size={14} strokeWidth={1.9} />
        ) : variant === 'reasoning' ? (
          <View style={[styles.doneMarker, { borderColor: colors.border }]}>
            <Check color="#2F9A68" size={9} strokeWidth={2.4} />
          </View>
        ) : (
          <View style={[styles.doneMarker, { borderColor: colors.border }]}>
            <StepIcon color="#2F9A68" size={9} strokeWidth={2.1} />
          </View>
        )}
      </View>
      <View style={styles.stepBody}>
        <Text
          numberOfLines={2}
          selectable
          style={[
            styles.stepLabel,
            variant === 'reasoning' && styles.reasoningLabel,
            { color: tone },
          ]}
        >
          {label}
        </Text>
        {detail ? (
          <Text numberOfLines={3} selectable style={[styles.stepDetail, { color: colors.subtle }]}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function WebFavicon({
  active,
  colors,
  host,
}: {
  active: boolean;
  colors: ActivityPalette;
  host: string;
}) {
  const candidates = useMemo(() => browserSafeFaviconUrls(host), [host]);
  const { logoUrl, onLogoError, onLogoLoad } = useLogoFallback(candidates);

  if (!logoUrl) {
    return <Globe2 color={colors.subtle} size={14} strokeWidth={1.8} />;
  }

  return (
    <View
      style={[
        styles.webFavicon,
        { borderColor: colors.border, backgroundColor: colors.background },
        active && { opacity: 0.72 },
      ]}
    >
      <ExpoImage
        contentFit="contain"
        onError={onLogoError}
        onLoad={onLogoLoad}
        source={{ uri: logoUrl }}
        style={styles.webFaviconImage}
        transition={0}
      />
    </View>
  );
}

function CapabilityBrandMark({
  active,
  brand,
  colors,
}: {
  active: boolean;
  brand: CapabilityBrand;
  colors: ActivityPalette;
}) {
  const { logoUrl, onLogoError, onLogoLoad } = useLogoFallback(brand.logoUrls);
  const showLogo = Boolean(logoUrl);
  const FallbackIcon = brand.fallback === 'terminal' ? Terminal : Server;
  return (
    <View
      style={[
        styles.brandMark,
        {
          backgroundColor: showLogo ? colors.background : brand.color,
          borderColor: brandBorderColor(brand.color, colors.border),
        },
        active && { shadowColor: brand.color, shadowOpacity: 0.18, shadowRadius: 4 },
      ]}
    >
      {showLogo ? (
        <ExpoImage
          contentFit="contain"
          onError={onLogoError}
          onLoad={onLogoLoad}
          source={{ uri: logoUrl }}
          style={styles.brandLogo}
          transition={0}
        />
      ) : brand.initials ? (
        <Text style={styles.brandInitials}>{brand.initials.slice(0, 2)}</Text>
      ) : (
        <FallbackIcon color="#FFFFFF" size={11} strokeWidth={2} />
      )}
    </View>
  );
}

const INITIAL_VISIBLE_DIFF_LINES = 160;
const fileDiffObjectIds = new WeakMap<object, number>();
let nextFileDiffObjectId = 1;

interface FileEditSummary {
  key: string;
  path: string;
  absolutePath?: string;
  added: number;
  deleted: number;
  approximate: boolean;
  binary: boolean;
  status: UIFileEdit['status'];
  operation?: UIFileEdit['operation'];
  pending: boolean;
  error?: string;
  diff?: UIFileEdit['diff'];
}

interface VisibleDiffHunk {
  hunk: RenderableFileDiffHunk;
  skippedBefore: number;
}

function FileEditGroup({
  colors,
  edits,
  displayMode,
  onOpenFilePreview,
  resolveFilePreviewAvailability,
}: {
  colors: ActivityPalette;
  edits: FileEditSummary[];
  displayMode: FileEditDisplayMode;
  onOpenFilePreview?: (path: string) => void;
  resolveFilePreviewAvailability?: (path: string) => Promise<boolean>;
}) {
  return (
    <View style={styles.fileGroup}>
      {edits.map((edit) => (
        <FileEditRow
          colors={colors}
          displayMode={displayMode}
          edit={edit}
          key={`${edit.key}:${fileDiffRevision(edit.diff)}`}
          onOpenFilePreview={onOpenFilePreview}
          resolveFilePreviewAvailability={resolveFilePreviewAvailability}
        />
      ))}
    </View>
  );
}

function FileEditRow({
  colors,
  edit,
  displayMode,
  onOpenFilePreview,
  resolveFilePreviewAvailability,
}: {
  colors: ActivityPalette;
  edit: FileEditSummary;
  displayMode: FileEditDisplayMode;
  onOpenFilePreview?: (path: string) => void;
  resolveFilePreviewAvailability?: (path: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [expandedLines, setExpandedLines] = useState(false);
  const failed = edit.status === 'error';
  const running = edit.status === 'editing';
  const deleting = edit.operation === 'delete';
  const action = failed
    ? deleting
      ? t('message.fileDeleteFailed', { defaultValue: 'Delete failed' })
      : t('message.fileEditFailed', { defaultValue: 'Edit failed' })
    : running
      ? deleting
        ? t('message.fileDeleting', { defaultValue: 'Deleting' })
        : t('message.fileEditing', { defaultValue: 'Editing' })
      : deleting
        ? t('message.fileDeleted', { defaultValue: 'Deleted' })
        : t('message.fileEdited', { defaultValue: 'Edited' });
  const path = compactActivityPath(redactActivityText(edit.path || edit.absolutePath || t('message.file', { defaultValue: 'File' })));
  const previewPath = edit.absolutePath || edit.path;
  const previewAvailable = useFilePreviewAvailability(
    previewPath,
    onOpenFilePreview,
    resolveFilePreviewAvailability,
  );
  const renderableDiff = useMemo(
    () => edit.diff ? parseRenderableFileDiff(edit.diff) : { hunks: [] },
    [edit.diff],
  );
  const totalLineCount = countDiffLines(renderableDiff);
  const canRenderDiff = displayMode !== 'summary' && !running && !failed && totalLineCount > 0;
  const shouldAutoCollapse = totalLineCount > INITIAL_VISIBLE_DIFF_LINES || Boolean(edit.diff?.truncated);
  const startsCollapsed = displayMode === 'collapsed_diff' || shouldAutoCollapse;
  const shouldRenderBody = canRenderDiff && (!startsCollapsed || open);
  const lineLimit = expandedLines ? totalLineCount : Math.min(totalLineCount, INITIAL_VISIBLE_DIFF_LINES);
  const visibleDiff = useMemo(
    () => selectVisibleDiffLines(renderableDiff, lineLimit),
    [lineLimit, renderableDiff],
  );
  const hiddenLineCount = Math.max(0, totalLineCount - lineLimit);
  const showStats = !failed && !edit.binary && (edit.added > 0 || edit.deleted > 0);

  return (
    <View style={[styles.fileCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.fileHeader}>
        <View style={styles.fileStatusIcon}>
          {running ? (
            <CircleDashed color={colors.subtle} size={15} strokeWidth={1.8} />
          ) : failed ? (
            <AlertCircle color={colors.errorText} size={15} strokeWidth={1.9} />
          ) : (
            <FilePenLine color="#2F9A68" size={15} strokeWidth={1.9} />
          )}
        </View>
        <View style={styles.fileTitleArea}>
          <Text style={[styles.fileAction, { color: failed ? colors.errorText : colors.muted }]}>
            {edit.pending && !edit.path
              ? t('message.fileEditPreparing', { defaultValue: 'Preparing file edit…' })
              : action}
          </Text>
          {path ? (
            <Pressable
              accessibilityHint={previewAvailable ? t('message.openFilePreview', { defaultValue: 'Open file preview' }) : undefined}
              accessibilityRole={previewAvailable ? 'button' : undefined}
              disabled={!previewAvailable}
              onPress={() => previewPath && onOpenFilePreview?.(previewPath)}
            >
              <Text
                numberOfLines={1}
                selectable
                style={[styles.filePath, { color: previewAvailable ? colors.foreground : colors.muted }]}
              >
                {path}
              </Text>
            </Pressable>
          ) : null}
          {failed && edit.error ? (
            <Text numberOfLines={2} style={[styles.fileError, { color: colors.errorText }]}>
              {safeActivityDetail(String(edit.error), 150)}
            </Text>
          ) : null}
        </View>
        {showStats ? (
          <View style={styles.diffPair}>
            <Text style={styles.added}>+{Math.max(0, Math.round(edit.added || 0))}</Text>
            <Text style={styles.deleted}>-{Math.max(0, Math.round(edit.deleted || 0))}</Text>
          </View>
        ) : null}
      </View>

      {canRenderDiff && startsCollapsed ? (
        <Pressable
          accessibilityLabel={open
            ? t('message.collapseDiff', { defaultValue: 'Collapse diff' })
            : t('message.viewDiff', { defaultValue: 'View diff' })}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => {
            if (open) setExpandedLines(false);
            setOpen((value) => !value);
          }}
          style={({ pressed }) => [
            styles.diffToggle,
            { borderTopColor: colors.border, backgroundColor: colors.pressed },
            pressed && { opacity: 0.72 },
          ]}
        >
          <ChevronRight
            color={colors.subtle}
            size={13}
            style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
          />
          <Text style={[styles.diffToggleLabel, { color: colors.muted }]}>
            {shouldAutoCollapse
              ? t('message.viewLargeDiff', { defaultValue: 'View large diff' })
              : t('message.viewDiff', { defaultValue: 'View diff' })}
          </Text>
          <Text style={[styles.diffToggleCount, { color: colors.subtle }]}>
            {t('message.diffLines', {
              count: `${totalLineCount}${edit.diff?.truncated ? '+' : ''}`,
              defaultValue: '{{count}} lines',
            })}
          </Text>
        </Pressable>
        ) : null}

      {shouldRenderBody ? (
        <View style={[styles.diffPanel, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
            <View style={styles.diffTable}>
              {visibleDiff.map(({ hunk, skippedBefore }, hunkIndex) => (
                <View
                  key={`${hunk.oldStart}:${hunk.newStart}:${hunkIndex}`}
                  style={hunkIndex > 0 ? [styles.diffHunk, { borderTopColor: colors.border }] : undefined}
                >
                  {skippedBefore > 0 ? (
                    <View style={[styles.diffGap, { backgroundColor: colors.pressed }]}>
                      <Text style={[styles.diffGapBadge, { color: colors.subtle, borderColor: colors.border }]}>…</Text>
                      <Text style={[styles.diffGapText, { color: colors.subtle }]}>
                        {t('message.diffUnchangedHidden', {
                          count: skippedBefore,
                          defaultValue: '{{count}} unchanged lines hidden',
                        })}
                      </Text>
                    </View>
                  ) : null}
                  {hunk.lines.map((line, lineIndex) => (
                    <View
                      key={`${hunkIndex}:${lineIndex}:${line.oldLineNumber}:${line.newLineNumber}`}
                      style={[
                        styles.diffRow,
                        line.kind === 'add' && styles.diffAdded,
                        line.kind === 'delete' && styles.diffDeleted,
                      ]}
                    >
                      <Text style={[styles.diffLineNumber, { color: colors.subtle, borderRightColor: colors.border }]}>
                        {line.oldLineNumber ?? ''}
                      </Text>
                      <Text style={[styles.diffLineNumber, { color: colors.subtle, borderRightColor: colors.border }]}>
                        {line.newLineNumber ?? ''}
                      </Text>
                      <Text style={[styles.diffMarker, { color: diffKindColor(line.kind, colors) }]}>
                        {line.kind === 'add' ? '+' : line.kind === 'delete' ? '-' : ' '}
                      </Text>
                      <Text selectable style={[styles.diffCode, { color: colors.foreground }]}>
                        {line.content || ' '}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          {hiddenLineCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpandedLines(true)}
              style={({ pressed }) => [styles.diffMoreButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <ChevronDown color={colors.subtle} size={13} />
              <Text style={[styles.moreLines, { color: colors.subtle }]}>
                {t('message.diffShowMoreLines', { count: hiddenLineCount, defaultValue: 'Show {{count}} more lines' })}
              </Text>
            </Pressable>
          ) : expandedLines && totalLineCount > INITIAL_VISIBLE_DIFF_LINES ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpandedLines(false)}
              style={({ pressed }) => [styles.diffMoreButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <ChevronUp color={colors.subtle} size={13} />
              <Text style={[styles.moreLines, { color: colors.subtle }]}>{t('message.diffShowLess', { defaultValue: 'Show fewer lines' })}</Text>
            </Pressable>
          ) : null}
          {edit.diff?.truncated ? (
            <View style={[styles.diffTruncated, { borderTopColor: colors.border, backgroundColor: colors.pressed }]}>
              <Text style={[styles.diffTruncatedText, { color: colors.subtle }]}>
                {t('message.diffTruncated', { defaultValue: 'Diff truncated. Open the file to view the full content.' })}
              </Text>
              {previewPath && onOpenFilePreview && previewAvailable ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpenFilePreview(previewPath)}
                  style={styles.openFileButton}
                >
                  <ExternalLink color={colors.muted} size={12} />
                  <Text style={[styles.openFileText, { color: colors.muted }]}>{t('message.openFile', { defaultValue: 'Open file' })}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function useFilePreviewAvailability(
  path: string | undefined,
  onOpenFilePreview: ((path: string) => void) | undefined,
  resolve: ((path: string) => Promise<boolean>) | undefined,
): boolean {
  const [result, setResult] = useState<{
    available: boolean;
    path: string;
    resolve: (path: string) => Promise<boolean>;
  } | null>(null);

  useEffect(() => {
    if (!path || !onOpenFilePreview || !resolve) return;
    let cancelled = false;
    void resolve(path)
      .then((available) => {
        if (!cancelled) setResult({ available, path, resolve });
      })
      .catch(() => {
        if (!cancelled) setResult({ available: false, path, resolve });
      });
    return () => {
      cancelled = true;
    };
  }, [onOpenFilePreview, path, resolve]);

  if (!path || !onOpenFilePreview) return false;
  if (!resolve) return true;
  return result?.resolve === resolve && result.path === path && result.available;
}

function fileDiffObjectId(diff: UIFileEdit['diff']): number {
  if (!diff) return 0;
  const existing = fileDiffObjectIds.get(diff);
  if (existing) return existing;
  const id = nextFileDiffObjectId;
  nextFileDiffObjectId += 1;
  fileDiffObjectIds.set(diff, id);
  return id;
}

function fileDiffRevision(diff: UIFileEdit['diff']): string {
  if (!diff) return 'none';
  const text = diff.text ?? '';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${fileDiffObjectId(diff)}:${text.length}:${hash >>> 0}:${diff.truncated ? 1 : 0}`;
}

function selectVisibleDiffLines(
  diff: RenderableFileDiff,
  lineLimit: number,
): VisibleDiffHunk[] {
  let remaining = Math.max(0, lineLimit);
  const visible: VisibleDiffHunk[] = [];
  let previous: RenderableFileDiffHunk | null = null;
  for (const hunk of diff.hunks) {
    if (remaining <= 0) break;
    const skippedBefore = previous ? countSkippedUnchangedLines(previous, hunk) : 0;
    const lines = hunk.lines.slice(0, remaining);
    visible.push({ hunk: { ...hunk, lines }, skippedBefore });
    remaining -= lines.length;
    previous = hunk;
  }
  return visible;
}

interface ToolEventState {
  event: ToolProgressEvent;
  error?: string;
  result?: unknown;
  status: GenericToolStatus;
}

interface CliRunSummary {
  key: string;
  name: string;
  args: string[];
  json: boolean;
  workingDir?: string;
  status: ToolStatus;
  error?: string;
}

interface McpRunSummary {
  key: string;
  presetName: string;
  displayName: string;
  toolName: string;
  args: unknown;
  status: ToolStatus;
  error?: string;
}

const TOOL_STATUS_RANK: Record<GenericToolStatus, number> = {
  running: 1,
  done: 2,
  error: 3,
};

const CLI_RUN_TOOL_NAMES = new Set(['run_cli_app', 'cli_anything_run']);
const MCP_TOOL_NAME_RE = /^mcp_([a-z0-9_-]+?)_(.+)$/i;

function parseCliRunTrace(line: string, status: ToolStatus): CliRunSummary | null {
  const match = /^(run_cli_app|cli_anything_run)\((.*)\)$/.exec(line.trim());
  if (!match) return null;
  const argsText = match[2].trim();
  if (!argsText) return cliRunFromArguments({}, { key: line, status });
  try {
    return cliRunFromArguments(JSON.parse(argsText), { key: line, status });
  } catch {
    return cliRunFromArguments({ args: [argsText] }, { key: line, status });
  }
}

function cliRunFromEvent(event: ToolProgressEvent): CliRunSummary | null {
  const name = toolEventName(event);
  if (!CLI_RUN_TOOL_NAMES.has(name)) return null;
  const args = parseToolEventArguments(event);
  return cliRunFromArguments(args, {
    key: event.call_id ? `call:${event.call_id}` : `${name}:${safeJson(args)}`,
    status: toolStatusFromPhase(event.phase),
    error: readableToolError(event.error),
  });
}

function cliRunMapByTraceLine(events: ToolProgressEvent[]): Map<string, CliRunSummary> {
  const runs = new Map<string, CliRunSummary>();
  for (const event of events) {
    const run = cliRunFromEvent(event);
    if (!run) continue;
    const line = formatToolCallTrace(event);
    if (!line) continue;
    const key = canonicalToolTrace(line);
    runs.set(key, mergeCliRun(runs.get(key), run));
  }
  return runs;
}

function mergeCliRun(
  existing: CliRunSummary | undefined,
  incoming: CliRunSummary,
): CliRunSummary {
  if (!existing) return incoming;
  return TOOL_STATUS_RANK[incoming.status] >= TOOL_STATUS_RANK[existing.status]
    ? { ...existing, ...incoming }
    : existing;
}

function cliRunFromArguments(
  value: unknown,
  options: { key: string; status: ToolStatus; error?: string },
): CliRunSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { name: 'cli', args: [], json: false, ...options };
  }
  const record = value as Record<string, unknown>;
  return {
    key: options.key,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'cli',
    args: Array.isArray(record.args)
      ? record.args.filter((item): item is string => typeof item === 'string')
      : [],
    json: record.json === true || record.json === 'true',
    workingDir: typeof record.working_dir === 'string' ? record.working_dir : undefined,
    status: options.status,
    error: options.error,
  };
}

function parseMcpRunTrace(line: string, status: ToolStatus): McpRunSummary | null {
  const match = /^([a-z0-9_-]+)\((.*)\)$/i.exec(line.trim());
  if (!match || !MCP_TOOL_NAME_RE.test(match[1])) return null;
  const raw = match[2].trim();
  let args: unknown = {};
  if (raw) {
    try {
      args = JSON.parse(raw);
    } catch {
      args = raw;
    }
  }
  return mcpRunFromToolName(match[1], args, { key: line, status });
}

function mcpRunFromEvent(event: ToolProgressEvent): McpRunSummary | null {
  const name = toolEventName(event);
  if (!MCP_TOOL_NAME_RE.test(name)) return null;
  const args = parseToolEventArguments(event);
  return mcpRunFromToolName(name, args, {
    key: event.call_id ? `call:${event.call_id}` : `${name}:${safeJson(args)}`,
    status: toolStatusFromPhase(event.phase),
    error: readableToolError(event.error),
  });
}

function mcpRunMapByTraceLine(events: ToolProgressEvent[]): Map<string, McpRunSummary> {
  const runs = new Map<string, McpRunSummary>();
  for (const event of events) {
    const run = mcpRunFromEvent(event);
    if (!run) continue;
    const line = formatToolCallTrace(event);
    if (!line) continue;
    const key = canonicalToolTrace(line);
    runs.set(key, mergeMcpRun(runs.get(key), run));
  }
  return runs;
}

function mergeMcpRun(
  existing: McpRunSummary | undefined,
  incoming: McpRunSummary,
): McpRunSummary {
  if (!existing) return incoming;
  return TOOL_STATUS_RANK[incoming.status] >= TOOL_STATUS_RANK[existing.status]
    ? { ...existing, ...incoming }
    : existing;
}

function mcpRunFromToolName(
  toolName: string,
  args: unknown,
  options: { key: string; status: ToolStatus; error?: string },
): McpRunSummary | null {
  const match = MCP_TOOL_NAME_RE.exec(toolName);
  if (!match) return null;
  const presetName = match[1].toLowerCase();
  return {
    key: options.key,
    presetName,
    displayName: titleFromCapabilityName(presetName),
    toolName: match[2],
    args,
    status: options.status,
    error: options.error,
  };
}

function parseToolEventArguments(event: ToolProgressEvent): unknown {
  const raw = event.function?.arguments ?? event.arguments;
  if (typeof raw !== 'string') return raw ?? {};
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { args: [raw] };
  }
}

function toolStatusFromPhase(phase: unknown): ToolStatus {
  if (phase === 'error') return 'error';
  if (phase === 'end') return 'done';
  return 'running';
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function titleFromCapabilityName(name: string): string {
  const overrides: Record<string, string> = {
    github: 'GitHub',
    gitlab: 'GitLab',
    openai: 'OpenAI',
  };
  return overrides[name.toLowerCase()] || name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || name;
}

function capabilityInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || value.slice(0, 2).toUpperCase();
}

function displayCliArg(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function formatCliArgs(run: CliRunSummary): string {
  return [...(run.json ? ['--json'] : []), ...run.args].map(displayCliArg).join(' ');
}

function toolRows(
  message: UIMessage,
  active: boolean,
  cliAppsByName: Map<string, CliAppInfo>,
  mcpPresetsByName: Map<string, McpPresetInfo>,
): ToolRowModel[] {
  const edits = message.fileEdits ?? [];
  const coveredCalls = new Set(edits.map((edit) => edit.call_id).filter(Boolean));
  const events = (message.toolEvents ?? []).filter((event) => {
    const name = compactEventToolName(toolEventName(event));
    return !(FILE_EDIT_TOOL_NAMES.has(name) && event.call_id && coveredCalls.has(event.call_id));
  });
  const webRunsByLine = webSearchRunsByTraceLine(events);
  const cliRunsByLine = cliRunMapByTraceLine(events);
  const mcpRunsByLine = mcpRunMapByTraceLine(events);
  const statesByLine = toolEventStatesByTraceLine(events);
  const renderedRunKeys = new Set<string>();
  const rows: ToolRowModel[] = [];
  let genericItems: GenericToolRunItem[] = [];
  let genericGroupIndex = 0;

  const flushGenericItems = () => {
    if (!genericItems.length) return;
    const presentation = describeGenericToolRun(genericItems);
    const status = normalizeToolStatus(presentation.status, active);
    const action = [presentation.label, presentation.detail].filter(Boolean).join(' ');
    rows.push({
      key: `generic:${genericItems[0].trace.groupKey}:${genericGroupIndex}`,
      label: presentation.aside ? `${action} · ${presentation.aside}` : action,
      icon: presentation.status === 'error' ? 'tool' : genericToolIcon(genericItems[0].trace.family),
      status,
    });
    genericItems = [];
    genericGroupIndex += 1;
  };

  const appendWebRun = (run: ReturnType<typeof webRunsByLine.get>, suffix: string) => {
    if (!run || renderedRunKeys.has(run.key)) return;
    flushGenericItems();
    renderedRunKeys.add(run.key);
    const status = normalizeToolStatus(run.status, active);
    rows.push({
      key: `web-search:${run.key}:${suffix}`,
      label: presentWebSearchAction(run.query, status, run.target),
      icon: 'search',
      status,
    });
    run.sources.forEach((source, index) => {
      rows.push({
        key: `web-source:${run.key}:${index}:${source.href}`,
        label: source.title,
        detail: source.displayUrl,
        icon: 'web',
        status: 'done',
        url: source.href,
        webHost: source.host,
      });
    });
  };

  const appendCliRun = (run: CliRunSummary, suffix: string) => {
    if (renderedRunKeys.has(run.key)) return;
    flushGenericItems();
    renderedRunKeys.add(run.key);
    const runStatus = normalizeToolStatus(run.status, active);
    const app = cliAppsByName.get(run.name.toLowerCase());
    const displayName = app?.display_name || titleFromCapabilityName(run.name);
    const action = runStatus === 'error'
      ? i18n.t('message.cliRunFailed')
      : runStatus === 'running'
        ? i18n.t('message.cliRunRunning')
        : i18n.t('message.cliRunRan');
    const args = safeActivityDetail(
      compactActivityPath(redactShellCommand(formatCliArgs(run))),
      120,
    );
    rows.push({
      key: `cli:${run.key}:${suffix}`,
      label: `${action} ${displayName}${args ? ` · ${args}` : ''}`,
      brand: {
        color: runStatus === 'error' ? '#DC2626' : app?.brand_color || '#0891B2',
        fallback: 'terminal',
        initials: app ? capabilityInitials(app.display_name || app.name) : undefined,
        logoUrls: logoFallbackUrls(app?.logo_url),
      },
      status: runStatus,
    });
  };

  const appendMcpRun = (run: McpRunSummary, suffix: string) => {
    if (renderedRunKeys.has(run.key)) return;
    flushGenericItems();
    renderedRunKeys.add(run.key);
    const runStatus = normalizeToolStatus(run.status, active);
    const preset = mcpPresetsByName.get(run.presetName.toLowerCase());
    const displayName = preset?.display_name || run.displayName;
    const activity = describeMcpActivity(run.toolName, run.args, runStatus);
    rows.push({
      key: `mcp:${run.key}:${suffix}`,
      label: `${activity.action}${activity.target ? ` ${activity.target}` : ''} · ${displayName}`,
      brand: {
        color: runStatus === 'error' ? '#DC2626' : preset?.brand_color || '#6D5DF6',
        fallback: 'server',
        initials: preset
          ? capabilityInitials(preset.display_name || preset.name)
          : undefined,
        logoUrls: logoFallbackUrls(preset?.logo_url),
      },
      status: runStatus,
    });
  };

  const lines = traceLines(message);
  lines.forEach((line, index) => {
    const traceKey = canonicalToolTrace(line);
    const state = statesByLine.get(traceKey);
    const fallback: GenericToolStatus = active && index === lines.length - 1 ? 'running' : 'done';
    const status = normalizeToolStatus(state?.status ?? fallback, active);

    const webRun = webRunsByLine.get(traceKey);
    if (webRun) {
      appendWebRun(webRun, String(index));
      return;
    }

    const cliRun = cliRunsByLine.get(traceKey) ?? parseCliRunTrace(line, status);
    if (cliRun) {
      appendCliRun(cliRun, String(index));
      return;
    }

    const mcpRun = mcpRunsByLine.get(traceKey) ?? parseMcpRunTrace(line, status);
    if (mcpRun) {
      appendMcpRun(mcpRun, String(index));
      return;
    }

    const genericTrace = parseGenericToolTrace(line);
    if (genericTrace) {
      const item: GenericToolRunItem = {
        trace: genericTrace,
        status,
        error: state?.error,
      };
      const previous = genericItems[genericItems.length - 1];
      if (previous && !canGroupGenericToolRuns(previous, item)) flushGenericItems();
      genericItems.push(item);
      return;
    }

    flushGenericItems();
    const eventName = state ? toolEventName(state.event) : '';
    if (state && isMcpToolName(eventName)) {
      const activity = describeMcpActivity(eventName, toolEventArguments(state.event), status);
      rows.push({
        key: `mcp:${state.event.call_id || traceKey}:${index}`,
        label: activity.action,
        detail: [activity.target, state.error].filter(Boolean).join(' · ') || undefined,
        icon: 'server',
        status,
      });
      return;
    }

    const trace = describeTraceLine(line, status, state?.result);
    rows.push({
      key: `trace:${index}:${traceKey}`,
      label: trace.url
        ? trace.label
        : [trace.label, trace.detail].filter(Boolean).join(' '),
      detail: trace.url
        ? [trace.detail, state?.error].filter(Boolean).join(' · ') || undefined
        : state?.error,
      icon: trace.icon === 'clock'
        ? 'clock'
        : trace.kind === 'search'
          ? 'search'
          : trace.url
            ? 'web'
            : 'tool',
      status,
      url: trace.url,
    });
  });
  flushGenericItems();

  for (const run of webRunsByLine.values()) appendWebRun(run, 'event');
  for (const run of cliRunsByLine.values()) appendCliRun(run, 'event');
  for (const run of mcpRunsByLine.values()) appendMcpRun(run, 'event');
  flushGenericItems();

  return rows;
}

function toolEventStatesByTraceLine(events: ToolProgressEvent[]): Map<string, ToolEventState> {
  const states = new Map<string, ToolEventState>();
  for (const event of events) {
    const line = formatToolCallTrace(event);
    if (!line) continue;
    const key = canonicalToolTrace(line);
    const status: GenericToolStatus = event.phase === 'error'
      ? 'error'
      : event.phase === 'end'
        ? 'done'
        : 'running';
    const next: ToolEventState = {
      event,
      error: status === 'error' ? readableToolError(event.error) : undefined,
      result: event.result,
      status,
    };
    const previous = states.get(key);
    if (!previous || TOOL_STATUS_RANK[next.status] >= TOOL_STATUS_RANK[previous.status]) {
      states.set(key, next);
    }
  }
  return states;
}

function normalizeToolStatus(status: GenericToolStatus, turnActive: boolean): ToolStatus {
  return status === 'running' && !turnActive ? 'done' : status;
}

function genericToolIcon(family: GenericToolRunItem['trace']['family']): ToolRowModel['icon'] {
  if (family === 'content-search' || family === 'file-search') return 'file-search';
  if (family === 'list') return 'list';
  if (family === 'read') return 'folder';
  if (family === 'memory') return 'memory';
  return 'play';
}

function isMcpToolName(name: string): boolean {
  const compact = name.toLowerCase();
  return compact.startsWith('mcp_')
    || compact.startsWith('mcp.')
    || compact.includes('mcp__')
    || /^(browser|page|playwright)[_.-]/.test(compact);
}

function compactEventToolName(name: string): string {
  return name.toLowerCase().split('.').pop() || name.toLowerCase();
}

function toolEventName(event: ToolProgressEvent): string {
  return typeof event.function?.name === 'string'
    ? event.function.name
    : typeof event.name === 'string'
      ? event.name
      : '';
}

function toolEventArguments(event: ToolProgressEvent): unknown {
  const raw = event.function?.arguments ?? event.arguments;
  if (typeof raw !== 'string') return raw;
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return raw;
  }
}

function readableToolError(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return safeActivityDetail(value, 180);
  try {
    return safeActivityDetail(JSON.stringify(value), 180);
  } catch {
    return i18n.t('message.toolCallFailed', { defaultValue: 'Tool call failed' });
  }
}

function compactReasoningPreview(value: string): string {
  return redactActivityText(value)
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_#`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function traceLines(message: UIMessage): string[] {
  if (message.traces?.length) return message.traces.filter((line) => line.trim());
  return message.content.trim() ? [message.content] : [];
}

function collectFileEdits(messages: UIMessage[]): UIFileEdit[] {
  const edits: UIFileEdit[] = [];
  for (const message of messages) {
    if (message.kind === 'trace' && message.fileEdits?.length) edits.push(...message.fileEdits);
  }
  return edits;
}

function fileEditCallKey(edit: UIFileEdit): string {
  if (edit.call_id && edit.path) return `${edit.call_id}|${edit.tool}|${edit.path}`;
  if (edit.call_id) return `${edit.call_id}|${edit.tool}`;
  return `${edit.tool}|${edit.path}`;
}

function latestFileEditEvents(edits: UIFileEdit[]): UIFileEdit[] {
  const order: string[] = [];
  const byKey = new Map<string, UIFileEdit>();
  for (const edit of edits) {
    const key = fileEditCallKey(edit);
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, edit);
  }
  return order.flatMap((key) => {
    const edit = byKey.get(key);
    return edit ? [edit] : [];
  });
}

function summarizeFileEdits(edits: UIFileEdit[], active: boolean): FileEditSummary[] {
  return latestFileEditEvents(edits).flatMap((edit) => {
    const editing = active && edit.status === 'editing';
    const failed = edit.status === 'error';
    if (!edit.path && edit.pending && !editing) return [];
    if (!edit.path && !editing && !failed) return [];

    const binary = Boolean(edit.binary);
    return [{
      key: fileEditCallKey(edit),
      path: edit.path || '',
      absolutePath: edit.absolute_path,
      added: binary ? 0 : edit.added,
      deleted: binary ? 0 : edit.deleted,
      approximate: active && Boolean(edit.approximate),
      binary,
      status: editing ? 'editing' : failed ? 'error' : 'done',
      operation: edit.operation,
      pending: Boolean(edit.pending) && !edit.path,
      error: edit.error,
      diff: edit.diff,
    }];
  });
}

function isFileEditTraceLine(line: string): boolean {
  return /^(write_file|edit_file|apply_patch)\(/.test(line.trim());
}

function messageHasOnlyFileActivity(message: UIMessage): boolean {
  if (message.kind !== 'trace' || !message.fileEdits?.length) return false;
  return traceLines(message).every((line) => !line.trim() || isFileEditTraceLine(line));
}

function activityDurationMs(
  messages: UIMessage[],
  active: boolean,
  now: number,
  completedLatencyMs?: number,
  startedAtMs?: number,
): number {
  if (!active && Number.isFinite(completedLatencyMs) && (completedLatencyMs ?? 0) >= 0) {
    return Math.round(completedLatencyMs ?? 0);
  }
  const timestamps = messages
    .map((message) => message.createdAt)
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return 0;
  const first = active && Number.isFinite(startedAtMs)
    ? startedAtMs ?? Math.min(...timestamps)
    : Math.min(...timestamps);
  const last = active && first > 1_000_000_000_000 ? now : Math.max(...timestamps);
  return Math.max(0, last - first);
}

function formatDuration(milliseconds: number): string {
  const seconds = milliseconds > 0 && milliseconds < 1_000
    ? 1
    : Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function diffKindColor(
  kind: 'context' | 'add' | 'delete',
  colors: ActivityPalette,
): string {
  if (kind === 'add') return '#2F8F61';
  if (kind === 'delete') return '#C35A63';
  return colors.muted;
}

function brandBorderColor(color: string, fallback: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return fallback;
  return `${color}38`;
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 720 },
  withBodyBelow: { marginBottom: 8 },
  header: {
    minHeight: 28,
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerLabel: { maxWidth: 270, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  timeline: { maxHeight: 180, marginTop: 6 },
  timelineContent: { paddingRight: 3, paddingBottom: 4 },
  step: { minWidth: 0, flexDirection: 'row', gap: 7, paddingVertical: 3 },
  marker: { width: 18, height: 20, alignItems: 'center', justifyContent: 'center' },
  doneMarker: {
    width: 14,
    height: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMark: {
    width: 16,
    height: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
  },
  brandLogo: { width: 13, height: 13 },
  brandInitials: { color: '#FFFFFF', fontSize: 6.5, lineHeight: 9, fontWeight: '700' },
  webFavicon: {
    width: 16,
    height: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webFaviconImage: { width: 14, height: 14 },
  stepBody: { minWidth: 0, flex: 1 },
  stepLabel: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  reasoningLabel: { fontStyle: 'italic', fontWeight: '400' },
  stepDetail: { marginTop: 1, fontSize: 11.5, lineHeight: 16 },
  fileGroup: { width: '100%', gap: 7, paddingVertical: 4 },
  fileCard: { width: '100%', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  fileHeader: { minHeight: 54, paddingHorizontal: 9, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileStatusIcon: { width: 18, alignItems: 'center' },
  fileTitleArea: { minWidth: 0, flex: 1 },
  fileAction: { fontSize: 10.5, lineHeight: 14, fontWeight: '500' },
  filePath: { marginTop: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  fileError: { marginTop: 2, fontSize: 10.5, lineHeight: 14 },
  diffPair: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  added: { color: '#2F8F61', fontSize: 11, fontVariant: ['tabular-nums'] },
  deleted: { color: '#C35A63', fontSize: 11, fontVariant: ['tabular-nums'] },
  diffToggle: {
    minHeight: 31,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  diffToggleLabel: { minWidth: 0, flex: 1, fontSize: 10.5, lineHeight: 15, fontWeight: '600' },
  diffToggleCount: { fontSize: 10.5, lineHeight: 15, fontVariant: ['tabular-nums'] },
  diffPanel: { borderTopWidth: StyleSheet.hairlineWidth },
  diffTable: { minWidth: '100%', paddingVertical: 5 },
  diffHunk: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, paddingTop: 4 },
  diffGap: {
    minHeight: 25,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  diffGapBadge: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 15,
  },
  diffGapText: { fontSize: 10.5, lineHeight: 15 },
  diffRow: { minHeight: 20, flexDirection: 'row', alignItems: 'stretch' },
  diffLineNumber: {
    width: 39,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 5,
    paddingVertical: 2,
    textAlign: 'right',
    fontFamily: 'monospace',
    fontSize: 9.5,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  diffMarker: {
    width: 21,
    paddingLeft: 7,
    paddingVertical: 2,
    fontFamily: 'monospace',
    fontSize: 10.5,
    lineHeight: 16,
  },
  diffCode: {
    minWidth: 280,
    paddingRight: 12,
    paddingVertical: 2,
    fontFamily: 'monospace',
    fontSize: 10.5,
    lineHeight: 16,
  },
  diffAdded: { backgroundColor: 'rgba(47,143,97,0.08)' },
  diffDeleted: { backgroundColor: 'rgba(195,90,99,0.08)' },
  diffMoreButton: {
    minHeight: 30,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moreLines: { fontSize: 10.5, lineHeight: 15, fontWeight: '600' },
  diffTruncated: {
    minHeight: 34,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
  },
  diffTruncatedText: { fontSize: 10.5, lineHeight: 15 },
  openFileButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  openFileText: { fontSize: 10.5, lineHeight: 15, fontWeight: '600' },
});
