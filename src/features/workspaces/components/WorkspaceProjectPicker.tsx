import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Folder from 'lucide-react-native/icons/folder';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  isAbsoluteWorkspacePath,
  projectNameFromPath,
  selectedProjectScope,
  shortWorkspacePath,
} from '@/services/runtime/workspace-paths';
import type { WorkspaceScopePayload, WorkspacesPayload } from '@/types/api/workspaces';

import { styles, type WorkspaceColors } from './workspace-controls-styles';

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

