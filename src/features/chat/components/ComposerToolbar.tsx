import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Paperclip from 'lucide-react-native/icons/paperclip';
import Square from 'lucide-react-native/icons/square';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ModelPresetMenu } from '@/features/chat/components/widgets/model-preset-menu';
import type {
  ComposerAppearance,
  ComposerAttachments,
  ComposerModelState,
  ComposerRuntimeState,
  ComposerWorkspaceState,
} from '@/features/chat/composer/model/view-contract';
import { WorkspaceAccessMenu } from '@/features/workspaces';

import { composerStyles as styles } from './composer-styles';

interface ComposerToolbarProps {
  appearance: ComposerAppearance;
  attachments: ComposerAttachments;
  canSend: boolean;
  model: ComposerModelState;
  runtime: ComposerRuntimeState;
  stopButton: boolean;
  workspace: ComposerWorkspaceState;
}

export function ComposerToolbar({
  appearance,
  attachments,
  canSend,
  model,
  runtime,
  stopButton,
  workspace,
}: ComposerToolbarProps) {
  const { t } = useTranslation();
  const { colors, variant } = appearance;

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
        {/* 移除录音波形后，工作区权限与模型选择始终显示；禁用状态仍由运行时统一控制。 */}
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
          onPresetChange={model.onChange}
          presets={model.presets}
        />
      </View>
      <View style={styles.composerToolbarRight}>
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
