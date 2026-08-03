import { AlertTriangle, Check, ChevronDown, Hand } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

import { scopeWithAccessMode } from '@/services/runtime/workspace-paths';
import type { WorkspaceAccessMode, WorkspaceScopePayload } from '@/types/api/workspaces';

import { styles, type WorkspaceColors } from './workspace-controls-styles';

export function WorkspaceAccessMenu({
  scope,
  disabled = false,
  canUseFullAccess,
  isHero,
  colors,
  onChange,
}: {
  scope: WorkspaceScopePayload;
  disabled?: boolean;
  canUseFullAccess: boolean;
  isHero: boolean;
  colors: WorkspaceColors;
  onChange?: (scope: WorkspaceScopePayload) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isFull = scope.access_mode === 'full';
  const accessLabel = isFull
    ? t('thread.composer.workspace.full')
    : t('thread.composer.workspace.default');

  const setMode = (mode: WorkspaceAccessMode) => {
    if (mode === 'full' && !canUseFullAccess) return;
    if (mode !== scope.access_mode) onChange?.(scopeWithAccessMode(scope, mode));
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityLabel={`${t('thread.composer.workspace.accessAria')}: ${accessLabel}`}
        disabled={disabled || !onChange}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.accessTrigger,
          isHero ? styles.accessTriggerHero : styles.accessTriggerThread,
          pressed && { backgroundColor: colors.pressed },
          (disabled || !onChange) && styles.disabled,
        ]}
      >
        {isFull
          ? <AlertTriangle color="#D97706" size={14} strokeWidth={2} />
          : <Hand color={colors.muted} size={14} strokeWidth={1.9} />}
        <Text numberOfLines={1} style={[styles.accessText, { color: isFull ? '#D97706' : colors.muted }]}>
          {isHero
            ? accessLabel
            : isFull
              ? t('thread.composer.workspace.fullShort')
              : t('thread.composer.workspace.defaultShort')}
        </Text>
        <ChevronDown color={isFull ? '#D97706' : colors.subtle} size={12} strokeWidth={2} />
      </Pressable>

      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel={t('common.dismiss')} onPress={() => setOpen(false)} style={styles.backdrop} />
          <View style={[styles.accessDialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.accessDialogTitle, { color: colors.subtle }]}>{t('thread.composer.workspace.accessAria')}</Text>
            <AccessOption
              colors={colors}
              icon={<Hand color={colors.foreground} size={17} strokeWidth={1.9} />}
              label={t('thread.composer.workspace.default')}
              onPress={() => setMode('restricted')}
              selected={!isFull}
            />
            <AccessOption
              colors={colors}
              disabled={!canUseFullAccess}
              icon={<AlertTriangle color="#D97706" size={17} strokeWidth={2} />}
              label={t('thread.composer.workspace.full')}
              onPress={() => setMode('full')}
              selected={isFull}
              warning
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

function AccessOption({
  colors,
  icon,
  label,
  selected,
  disabled = false,
  warning = false,
  onPress,
}: {
  colors: WorkspaceColors;
  icon: ReactNode;
  label: string;
  selected: boolean;
  disabled?: boolean;
  warning?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.accessOption,
        pressed && { backgroundColor: colors.pressed },
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.accessOptionIcon}>{icon}</View>
      <Text style={[styles.accessOptionText, { color: warning ? '#D97706' : colors.foreground }]}>{label}</Text>
      {selected ? <Check color={warning ? '#D97706' : colors.foreground} size={16} /> : null}
    </Pressable>
  );
}

