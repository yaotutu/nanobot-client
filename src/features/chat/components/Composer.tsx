import { useMemo, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  ArrowUp,
  Brain,
  FileText,
  Mic,
  Paperclip,
  Quote,
  Square,
  X,
} from 'lucide-react-native';

import { useLogoFallback } from '@/hooks/use-logo-fallback';
import { formatVoiceDuration } from '@/features/chat/components/timeline';
import { WorkspaceAccessMenu, WorkspaceProjectPicker } from '@/components/widgets/workspace-controls';
import {
  type CapabilityMentionCandidate,
} from '@/features/chat/capability-mentions';
import {
  type SkillMentionCandidate,
} from '@/features/chat/skill-mentions';
import {
  parseQuotedUserMessage,
} from '@/services/text/user-quote-format';

import type {
  ComposerAttachment,
  SendAttachment,
  SendMessageOptions,
  SlashCommand,
} from '@/types/api/chat';
import type { GoalStateWsPayload } from '@/types/api/runtime';
import type { SettingsPayload } from '@/types/api/settings';
import type {
  WorkspaceScopePayload,
  WorkspacesPayload,
} from '@/types/api/workspaces';
import type { Palette } from '@/ui/palette';
import { logoFallbackUrls } from '@/services/links/provider-brand';

import { ModelPresetMenu } from '@/components/widgets/model-preset-menu';
import { VoiceRecorderController } from '@/hooks/use-voice-recorder';
import { RunGoalStatus } from '@/components/widgets/run-goal-status';

interface QueuedPrompt {
  id: string;
  text: string;
  attachments: SendAttachment[];
  options?: SendMessageOptions;
}

interface ComposerSlashCommand extends SlashCommand {
  recent: boolean;
}



export function Composer({
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


export function AttachmentChip({
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

export function MentionCandidateLogo({
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

const styles = StyleSheet.create({
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
