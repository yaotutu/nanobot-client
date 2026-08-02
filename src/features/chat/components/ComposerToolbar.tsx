import { ArrowUp, Mic, Paperclip, Square } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { formatVoiceDuration } from '@/features/chat/components/timeline';
import { ModelPresetMenu } from '@/features/chat/components/widgets/model-preset-menu';
import { WorkspaceAccessMenu } from '@/features/workspaces/components/WorkspaceControls';
import type { VoiceRecorderController } from '@/hooks/use-voice-recorder';
import type { SettingsPayload } from '@/types/api/settings';
import type { WorkspaceScopePayload, WorkspacesPayload } from '@/types/api/workspaces';
import type { Palette } from '@/ui/palette';
import { composerStyles as styles } from './composer-styles';

export function ComposerToolbar(props: {
  activeModelPreset: string;
  colors: Palette;
  modelName: string;
  modelPresets: SettingsPayload['model_presets'];
  variant: 'hero' | 'thread';
  turnActive: boolean;
  disabled: boolean;
  attachmentBusy: boolean;
  attachmentFull: boolean;
  canSend: boolean;
  stopButton: boolean;
  workspaceScope: WorkspaceScopePayload | null;
  workspaceControls: WorkspacesPayload['controls'] | null;
  workspaceScopeDisabled: boolean;
  voiceRecorder: VoiceRecorderController;
  onAddAttachment: () => void;
  onModelPresetChange: (name: string) => Promise<void>;
  onOpenModelSettings: () => void;
  onWorkspaceScopeChange: (scope: WorkspaceScopePayload) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const { colors, voiceRecorder } = props;
  return (
    <View style={styles.composerToolbar}>
      <View style={styles.composerToolbarLeft}>
        <Pressable
          accessibilityLabel={t('thread.composer.attachImage')}
          accessibilityState={{ disabled: props.disabled || props.attachmentFull }}
          disabled={props.disabled || props.attachmentFull}
          hitSlop={6}
          onPress={props.onAddAttachment}
          style={[styles.roundIconButton, (props.disabled || props.attachmentFull) && styles.sendButtonDisabled]}
        >
          <Paperclip color={colors.muted} size={17} strokeWidth={1.8} />
        </Pressable>
        {voiceRecorder.phase === 'recording' ? (
          <View style={styles.voiceMeter}>
            <View style={styles.voiceWaveform}>
              {voiceRecorder.waveform.map((level, index) => (
                <View key={index} style={[styles.voiceWaveBar, { backgroundColor: '#E5484D', height: Math.max(3, Math.round(level * 20)) }]} />
              ))}
            </View>
            <Text selectable style={[styles.voiceDuration, { color: colors.muted }]}>{formatVoiceDuration(voiceRecorder.elapsedMs)}</Text>
          </View>
        ) : (
          <>
            {props.workspaceScope ? (
              <WorkspaceAccessMenu
                canUseFullAccess={props.workspaceControls?.can_use_full_access !== false}
                colors={colors}
                disabled={props.disabled || props.workspaceScopeDisabled}
                isHero={props.variant === 'hero'}
                onChange={props.onWorkspaceScopeChange}
                scope={props.workspaceScope}
              />
            ) : null}
            <ModelPresetMenu
              activePreset={props.activeModelPreset}
              colors={colors}
              disabled={props.disabled}
              displayLabel={props.modelName}
              onOpenSettings={props.onOpenModelSettings}
              onPresetChange={props.onModelPresetChange}
              presets={props.modelPresets}
            />
          </>
        )}
      </View>
      <View style={styles.composerToolbarRight}>
        {!props.turnActive ? (
          <Pressable
            accessibilityLabel={voiceRecorder.phase === 'recording' ? t('thread.composer.voice.stop') : t('thread.composer.tools.voice')}
            accessibilityState={{ busy: voiceRecorder.phase === 'transcribing', disabled: voiceRecorder.disabled }}
            delayLongPress={140}
            disabled={voiceRecorder.disabled}
            hitSlop={6}
            onLongPress={voiceRecorder.onLongPress}
            onPress={voiceRecorder.onPress}
            onPressOut={voiceRecorder.onPressOut}
            style={[styles.roundIconButton, voiceRecorder.phase === 'recording' && styles.voiceRecordingButton, voiceRecorder.disabled && styles.sendButtonDisabled]}
          >
            {voiceRecorder.phase === 'transcribing'
              ? <ActivityIndicator color={colors.muted} size="small" />
              : voiceRecorder.phase === 'recording'
                ? <Square color="#FFFFFF" fill="#FFFFFF" size={10} />
                : <Mic color={colors.muted} size={17} strokeWidth={1.8} />}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={props.stopButton ? t('thread.composer.stop') : t('thread.composer.send')}
          accessibilityState={{ busy: props.disabled || props.attachmentBusy, disabled: !props.stopButton && !props.canSend }}
          disabled={!props.stopButton && !props.canSend}
          onPress={props.stopButton ? props.onStop : props.onSend}
          style={[styles.sendButton, { backgroundColor: colors.foreground }, !props.stopButton && !props.canSend && styles.sendButtonDisabled]}
        >
          {props.stopButton
            ? <Square color={colors.background} fill={colors.background} size={10} />
            : props.disabled || props.attachmentBusy
              ? <ActivityIndicator color={colors.background} size="small" />
              : <ArrowUp color={colors.background} size={18} strokeWidth={2.3} />}
        </Pressable>
      </View>
    </View>
  );
}
