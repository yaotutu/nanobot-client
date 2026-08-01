import { AlertTriangle, Check, ChevronDown, Folder, Hand, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  isAbsoluteWorkspacePath,
  projectNameFromPath,
  scopeWithAccessMode,
  selectedProjectScope,
  shortWorkspacePath,
} from '@/services/workspace-paths';
import type {
  WorkspaceAccessMode,
  WorkspaceScopePayload,
  WorkspacesPayload,
} from '@/types/api';

interface WorkspaceColors {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
  errorText: string;
}

export function WorkspaceProjectPicker({
  isHero,
  disabled = false,
  scope,
  defaultScope,
  controls,
  error,
  colors,
  onChange,
}: {
  isHero: boolean;
  disabled?: boolean;
  scope: WorkspaceScopePayload | null;
  defaultScope: WorkspaceScopePayload | null;
  controls: WorkspacesPayload['controls'] | null;
  error?: string | null;
  colors: WorkspaceColors;
  onChange?: (scope: WorkspaceScopePayload) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pathDraft, setPathDraft] = useState('');
  const [pathError, setPathError] = useState<string | null>(null);
  const currentProjectScope = selectedProjectScope(scope, defaultScope);
  const projectLabel = currentProjectScope
    ? currentProjectScope.project_name || projectNameFromPath(currentProjectScope.project_path)
    : t('thread.composer.workspace.projectPlaceholder');
  const visible = isHero
    && Boolean(defaultScope)
    && Boolean(onChange)
    && controls?.can_change_project !== false;

  if (!visible || !defaultScope || !onChange) return null;

  const applyProjectPath = (projectPath: string, projectName?: string) => {
    const base = scope ?? defaultScope;
    const trimmed = projectPath.trim();
    if (!trimmed || !isAbsoluteWorkspacePath(trimmed)) {
      setPathError(t('workspace.dialog.absolutePathRequired'));
      return;
    }
    onChange({
      ...base,
      project_path: trimmed,
      project_name: projectName || projectNameFromPath(trimmed),
      restrict_to_workspace: base.access_mode === 'restricted',
    });
    setPathError(null);
    setOpen(false);
  };

  return (
    <View style={[styles.projectBar, { backgroundColor: colors.pressed }]}>
      <Pressable
        accessibilityLabel={t('thread.composer.workspace.projectAria')}
        disabled={disabled}
        onPress={() => {
          setPathDraft(currentProjectScope?.project_path ?? '');
          setPathError(null);
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.projectTrigger,
          pressed && { backgroundColor: colors.background },
          disabled && styles.disabled,
        ]}
      >
        <Folder color={currentProjectScope ? colors.foreground : colors.muted} size={14} strokeWidth={1.9} />
        <Text numberOfLines={1} style={[styles.projectTriggerText, { color: currentProjectScope ? colors.foreground : colors.muted }]}>
          {projectLabel}
        </Text>
        <ChevronDown color={colors.subtle} size={13} strokeWidth={2} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" numberOfLines={1} style={[styles.inlineError, { color: colors.errorText }]}>
          {error}
        </Text>
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        transparent
        visible={open}
      >
        <KeyboardAvoidingView
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable accessibilityLabel={t('common.dismiss')} onPress={() => setOpen(false)} style={styles.backdrop} />
          <View style={[styles.projectDialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.dialogHeader}>
              <View>
                <Text style={[styles.dialogTitle, { color: colors.foreground }]}>{t('thread.composer.workspace.projectAria')}</Text>
                <Text style={[styles.dialogSubtitle, { color: colors.subtle }]}>{t('settings.overview.workspace')}</Text>
              </View>
              <Pressable accessibilityLabel={t('common.dismiss')} hitSlop={8} onPress={() => setOpen(false)} style={styles.closeButton}>
                <X color={colors.muted} size={17} />
              </Pressable>
            </View>

            <Pressable
              accessibilityLabel={t('workspace.dialog.defaultProject')}
              onPress={() => applyProjectPath(defaultScope.project_path, defaultScope.project_name)}
              style={({ pressed }) => [
                styles.defaultProjectRow,
                { backgroundColor: pressed ? colors.pressed : colors.background },
              ]}
            >
              <View style={[styles.projectIcon, { backgroundColor: colors.pressed }]}>
                <Folder color={colors.foreground} size={16} strokeWidth={1.8} />
              </View>
              <View style={styles.projectBody}>
                <Text style={[styles.projectName, { color: colors.foreground }]}>{t('workspace.dialog.defaultProject')}</Text>
                <Text numberOfLines={1} style={[styles.projectPath, { color: colors.subtle }]}>
                  {shortWorkspacePath(defaultScope.project_path)}
                </Text>
              </View>
              {!currentProjectScope ? <Check color={colors.foreground} size={16} /> : null}
            </Pressable>

            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t('workspace.dialog.manual')}</Text>
            <View style={styles.pathForm}>
              <TextInput
                accessibilityLabel={t('workspace.dialog.manual')}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!disabled}
                onChangeText={(value) => {
                  setPathDraft(value);
                  setPathError(null);
                }}
                onSubmitEditing={() => applyProjectPath(pathDraft)}
                placeholder="/Users/name/project"
                placeholderTextColor={colors.subtle}
                returnKeyType="done"
                style={[
                  styles.pathInput,
                  { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
                ]}
                value={pathDraft}
              />
              <Pressable
                accessibilityLabel={t('workspace.dialog.usePath')}
                disabled={disabled || !pathDraft.trim()}
                onPress={() => applyProjectPath(pathDraft)}
                style={({ pressed }) => [
                  styles.usePathButton,
                  { backgroundColor: colors.foreground },
                  pressed && { opacity: 0.84 },
                  (disabled || !pathDraft.trim()) && styles.disabled,
                ]}
              >
                <Text style={[styles.usePathText, { color: colors.background }]}>{t('workspace.dialog.usePath')}</Text>
              </Pressable>
            </View>
            {pathError || error ? (
              <Text accessibilityRole="alert" style={[styles.dialogError, { color: colors.errorText }]}>
                {pathError ?? error}
              </Text>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

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

const styles = StyleSheet.create({
  disabled: { opacity: 0.48 },
  projectBar: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  projectTrigger: {
    minWidth: 0,
    maxWidth: 250,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  projectTriggerText: { minWidth: 0, flexShrink: 1, fontSize: 12, fontWeight: '500' },
  inlineError: { minWidth: 0, flex: 1, fontSize: 11, fontWeight: '600' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  projectDialog: {
    marginHorizontal: 12,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  dialogTitle: { fontSize: 16, fontWeight: '700' },
  dialogSubtitle: { marginTop: 3, fontSize: 11.5 },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  defaultProjectRow: { minHeight: 58, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  projectIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  projectBody: { minWidth: 0, flex: 1 },
  projectName: { fontSize: 13, fontWeight: '700' },
  projectPath: { marginTop: 2, fontSize: 11.5 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 11 },
  fieldLabel: { marginBottom: 7, marginLeft: 2, fontSize: 11.5, fontWeight: '600' },
  pathForm: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pathInput: { minWidth: 0, flex: 1, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, fontSize: 12.5 },
  usePathButton: { height: 40, borderRadius: 20, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  usePathText: { fontSize: 12, fontWeight: '700' },
  dialogError: { marginTop: 8, marginHorizontal: 2, fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  accessTrigger: { minWidth: 0, maxWidth: 165, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 7 },
  accessTriggerHero: { height: 32 },
  accessTriggerThread: { height: 34 },
  accessText: { minWidth: 0, flexShrink: 1, fontSize: 11.5, fontWeight: '600' },
  accessDialog: {
    width: 232,
    marginLeft: 12,
    marginBottom: 92,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 7,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.17,
    shadowRadius: 20,
    elevation: 11,
  },
  accessDialogTitle: { paddingHorizontal: 9, paddingTop: 6, paddingBottom: 5, fontSize: 10.5, fontWeight: '700' },
  accessOption: { minHeight: 44, borderRadius: 12, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  accessOptionIcon: { width: 22, alignItems: 'center' },
  accessOptionText: { minWidth: 0, flex: 1, fontSize: 13, fontWeight: '600' },
});
