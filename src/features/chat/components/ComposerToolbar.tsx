import { ArrowUp, Mic, Paperclip, Square } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ModelPresetMenu } from '@/features/chat/components/widgets/model-preset-menu';
import type {
  ComposerAppearance,
  ComposerAttachments,
  ComposerModelState,
  ComposerRuntimeState,
  ComposerVoiceState,
  ComposerWorkspaceState,
} from '@/features/chat/composer/model/view-contract';
import { formatVoiceDuration } from '@/features/chat/model/timeline';
import { WorkspaceAccessMenu } from '@/features/workspaces';

import { composerStyles as styles } from './composer-styles';

interface ComposerToolbarProps {
  appearance: ComposerAppearance;
  attachments: ComposerAttachments;
  canSend: boolean;
  model: ComposerModelState;
  runtime: ComposerRuntimeState;
  stopButton: boolean;
  voice: ComposerVoiceState;
  workspace: ComposerWorkspaceState;
}

export function ComposerToolbar({
  appearance,
  attachments,
  canSend,
  model,
  runtime,
  stopButton,
  voice,
  workspace,
}: ComposerToolbarProps) {
  const { t } = useTranslation();
  const { colors, variant } = appearance;
  const voiceRecorder = voice.recorder;

  return (
    <View style={styles.composerToolbar}>
      <View style={styles.composerToolbarLeft}>
        <Pressable
          accessibilityLabel={t('thread.composer.attachImage')}
          accessibilityState={{ disabled: runtime.disabled || attachments.full }}
          disabled={runtime.disabled || attachments.full}
          hitSlop={6}
          onPress={attachments.onAdd}
          style={[
            styles.roundIconButton,
            (runtime.disabled || attachments.full) && styles.sendButtonDisabled,
          ]}
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
            {workspace.scope ? (
              <WorkspaceAccessMenu
                canUseFullAccess={workspace.controls?.can_use_full_access !== false}
                colors={colors}
                disabled={runtime.disabled || workspace.disabled}
                isHero={variant === 'hero'}
                onChange={workspace.onChange}
                scope={workspace.scope}
              />
            ) : null}
            <ModelPresetMenu
              activePreset={model.activePreset}
              colors={colors}
              disabled={runtime.disabled}
              displayLabel={model.displayName}
              onOpenSettings={model.onOpenSettings}
              onPresetChange={model.onChange}
              presets={model.presets}
            />
          </>
        )}
      </View>
      <View style={styles.composerToolbarRight}>
        {!runtime.turnActive ? (
          <Pressable
            accessibilityLabel={
              voiceRecorder.phase === 'recording'
                ? t('thread.composer.voice.stop')
                : t('thread.composer.tools.voice')
            }
            accessibilityState={{
              busy: voiceRecorder.phase === 'transcribing',
              disabled: voiceRecorder.disabled,
            }}
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
          accessibilityLabel={
            stopButton ? t('thread.composer.stop') : t('thread.composer.send')
          }
          accessibilityState={{
            busy: runtime.disabled || attachments.busy,
            disabled: !stopButton && !canSend,
          }}
          disabled={!stopButton && !canSend}
          onPress={stopButton ? runtime.onStop : runtime.onSend}
          style={[
            styles.sendButton,
            { backgroundColor: colors.foreground },
            !stopButton && !canSend && styles.sendButtonDisabled,
          ]}
        >
          {stopButton
            ? <Square color={colors.background} fill={colors.background} size={10} />
            : runtime.disabled || attachments.busy
              ? <ActivityIndicator color={colors.background} size="small" />
              : <ArrowUp color={colors.background} size={18} strokeWidth={2.3} />}
        </Pressable>
      </View>
    </View>
  );
}
