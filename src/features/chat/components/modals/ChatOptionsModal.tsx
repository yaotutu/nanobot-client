import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatModelSelection, ChatScreenController } from '@/features/chat/model/chat-screen-contract';
import { isAbsoluteWorkspacePath, projectNameFromPath, scopeWithAccessMode } from '@/services/runtime/workspace-paths';
import type { WorkspaceAccessMode } from '@/types/api/workspaces';
import type { Palette } from '@/ui/palette';

interface ChatOptionsModalProps {
  colors: Palette;
  model: ChatModelSelection;
  workspace: ChatScreenController['workspace'];
  canChangeProject: boolean;
  disabled: boolean;
  turnActive: boolean;
  onClose: () => void;
}

/**
 * 只集中展示 nanobot 已有的聊天配置，不引入 OpenMuse 的模型或工作区业务。
 * 三项配置共用一个原生 Modal；选择列表和路径表单在弹窗内展开，避免嵌套 Modal
 * 造成返回键关闭层级不一致，也不再维护旧输入框底栏和三个独立选择弹窗。
 */
export function ChatOptionsModal({
  colors,
  model,
  workspace,
  canChangeProject,
  disabled,
  turnActive,
  onClose,
}: ChatOptionsModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<'model' | 'workspace' | null>(null);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [pathDraft, setPathDraft] = useState('');
  const [pathError, setPathError] = useState<string | null>(null);
  const presets = model.orderedModelPresets.filter((preset) => preset.name.trim());
  const scope = workspace.activeScope;
  const defaultScope = workspace.catalog?.default_scope ?? null;
  const controls = workspace.catalog?.controls;
  // 请求期间阻止模型重复提交；工作区与权限还需避开正在执行的回合。
  const modelDisabled = disabled || Boolean(pendingModel);
  const workspaceDisabled = disabled || turnActive;
  const projectEditable = canChangeProject && Boolean(defaultScope) && controls?.can_change_project !== false;

  const chooseModel = async (name: string) => {
    if (modelDisabled) return;
    if (name === model.activeModelPreset) {
      setSection(null);
      return;
    }
    setPendingModel(name);
    try {
      await model.changeModelPreset(name);
      setSection(null);
    } catch {
      // 原控制器负责回滚并显示错误；失败时保留模型列表，允许用户重试。
    } finally {
      setPendingModel(null);
    }
  };

  const chooseAccess = (mode: WorkspaceAccessMode) => {
    if (workspaceDisabled || !scope || (mode === 'full' && controls?.can_use_full_access === false)) return;
    if (mode !== scope.access_mode) workspace.updateScope(scopeWithAccessMode(scope, mode));
  };

  const applyProject = (path: string, name?: string) => {
    if (workspaceDisabled || !projectEditable || !defaultScope) return;
    const trimmed = path.trim();
    if (!trimmed || !isAbsoluteWorkspacePath(trimmed)) {
      setPathError(t('workspace.dialog.absolutePathRequired'));
      return;
    }
    // 切换项目只改变路径和名称；保留当前访问模式，不能悄悄升级为完全权限。
    const base = scope ?? defaultScope;
    workspace.updateScope({
      ...base,
      project_path: trimmed,
      project_name: name || projectNameFromPath(trimmed),
      restrict_to_workspace: base.access_mode === 'restricted',
    });
    setPathError(null);
    setSection(null);
  };

  return (
    <Modal testID="chat-options-modal" animationType="slide" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView behavior="height" style={styles.root}>
        <Pressable accessibilityLabel={t('common.dismiss')} accessibilityRole="button" onPress={onClose} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <View style={styles.headerBody}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{t('thread.composer.options')}</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>{t('thread.options.description')}</Text>
            </View>
            <Pressable accessibilityLabel={t('common.dismiss')} accessibilityRole="button" onPress={onClose} style={styles.close}>
              <X color={colors.muted} size={20} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.section, { backgroundColor: colors.background }]}>
              <Text style={[styles.label, { color: colors.muted }]}>{t('settings.models.selectModel')}</Text>
              <Pressable
                accessibilityLabel={t('settings.rows.currentModel') + ': ' + model.modelDisplayLabel}
                accessibilityRole="button"
                accessibilityState={{ disabled: modelDisabled || presets.length < 2, expanded: section === 'model' }}
                disabled={modelDisabled || presets.length < 2}
                onPress={() => setSection(section === 'model' ? null : 'model')}
                style={[styles.trigger, (disabled || presets.length < 2) && styles.disabled]}
              >
                <Text style={[styles.value, { color: colors.foreground }]}>{model.modelDisplayLabel || t('thread.composer.modelNotConfigured')}</Text>
                {presets.length > 1 ? <ChevronDown color={colors.subtle} size={18} /> : null}
              </Pressable>
              {section === 'model' ? <View style={styles.list}>
                {presets.map((preset) => {
                  const selected = preset.name === model.activeModelPreset;
                  return (
                    <Pressable key={preset.name}
                      accessibilityLabel={t('settings.rows.selectedPreset') + ': ' + (preset.label || preset.name)}
                      accessibilityRole="button" accessibilityState={{ selected, disabled: modelDisabled }}
                      disabled={modelDisabled} onPress={() => void chooseModel(preset.name)}
                      style={({ pressed }) => [styles.option, { backgroundColor: selected || pressed ? colors.pressed : colors.card }, disabled && styles.disabled]}
                    >
                      <View style={styles.optionBody}>
                        <Text style={[styles.value, { color: colors.foreground }]}>{preset.label || preset.name}</Text>
                        <Text style={[styles.detail, { color: colors.muted }]}>{[preset.resolved_provider || preset.provider, preset.model].filter(Boolean).join(' · ')}</Text>
                      </View>
                      {pendingModel === preset.name ? <ActivityIndicator color={colors.muted} /> : selected ? <Check color={colors.foreground} size={18} /> : null}
                    </Pressable>
                  );
                })}
              </View> : null}
            </View>

            <View style={[styles.section, { backgroundColor: colors.background }]}>
              <Text style={[styles.label, { color: colors.muted }]}>{t('settings.overview.workspace')}</Text>
              {projectEditable ? (
                <Pressable accessibilityLabel={t('thread.composer.workspace.projectAria')} accessibilityRole="button"
                  accessibilityState={{ disabled: workspaceDisabled, expanded: section === 'workspace' }} disabled={workspaceDisabled}
                  onPress={() => {
                    setPathDraft(scope?.project_path ?? defaultScope?.project_path ?? '');
                    setPathError(null);
                    setSection(section === 'workspace' ? null : 'workspace');
                  }}
                  style={[styles.trigger, workspaceDisabled && styles.disabled]}
                >
                  <Text style={[styles.value, { color: colors.foreground }]}>{scope?.project_name || defaultScope?.project_name || t('workspace.dialog.defaultProject')}</Text>
                  <ChevronDown color={colors.subtle} size={18} />
                </Pressable>
              ) : <Text style={[styles.readOnlyValue, { color: colors.foreground }]}>{scope?.project_name || defaultScope?.project_name || t('thread.options.unavailable')}</Text>}
              <Text selectable style={[styles.detail, { color: colors.muted }]}>{scope?.project_path || defaultScope?.project_path || t('thread.options.unavailable')}</Text>
              {!projectEditable && (scope || defaultScope) ? <Text style={[styles.hint, { color: colors.subtle }]}>{t('thread.options.projectLocked')}</Text> : null}
              {section === 'workspace' && projectEditable ? <View style={styles.list}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('workspace.dialog.defaultProject')} disabled={workspaceDisabled}
                  onPress={() => defaultScope && applyProject(defaultScope.project_path, defaultScope.project_name)}
                  style={[styles.option, { backgroundColor: colors.card }, workspaceDisabled && styles.disabled]}
                >
                  <View style={styles.optionBody}>
                    <Text style={[styles.value, { color: colors.foreground }]}>{t('workspace.dialog.defaultProject')}</Text>
                    <Text style={[styles.detail, { color: colors.muted }]}>{defaultScope?.project_path}</Text>
                  </View>
                </Pressable>
                <TextInput accessibilityLabel={t('workspace.dialog.manual')} autoCapitalize="none" autoCorrect={false}
                  editable={!workspaceDisabled}
                  value={pathDraft}
                  onChangeText={(value) => {
                    setPathDraft(value);
                    setPathError(null);
                  }}
                  onSubmitEditing={() => applyProject(pathDraft)} placeholder={t('workspace.dialog.manualPlaceholder')} placeholderTextColor={colors.subtle} returnKeyType="done"
                  style={[styles.pathInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                />
                <Pressable accessibilityLabel={t('workspace.dialog.usePath')} accessibilityRole="button"
                  accessibilityState={{ disabled: workspaceDisabled || !pathDraft.trim() }} disabled={workspaceDisabled || !pathDraft.trim()}
                  onPress={() => applyProject(pathDraft)} style={[styles.applyButton, { backgroundColor: colors.foreground }, (workspaceDisabled || !pathDraft.trim()) && styles.disabled]}
                ><Text style={[styles.applyText, { color: colors.background }]}>{t('workspace.dialog.usePath')}</Text></Pressable>
                {pathError ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.errorText }]}>{pathError}</Text> : null}
              </View> : null}
            </View>

            <View style={[styles.section, { backgroundColor: colors.background }]}>
              <Text style={[styles.label, { color: colors.muted }]}>{t('thread.composer.workspace.accessAria')}</Text>
              {scope ? <View style={styles.list}>
                {(['restricted', 'full'] as const).map((mode) => {
                  const selected = scope.access_mode === mode;
                  const blocked = workspaceDisabled || (mode === 'full' && controls?.can_use_full_access === false);
                  const label = t(mode === 'full' ? 'thread.composer.workspace.full' : 'thread.composer.workspace.default');
                  return <Pressable key={mode} accessibilityRole="button" accessibilityLabel={label}
                    accessibilityState={{ disabled: blocked, selected }} disabled={blocked} onPress={() => chooseAccess(mode)}
                    style={({ pressed }) => [styles.option, { backgroundColor: selected || pressed ? colors.pressed : colors.card }, blocked && styles.disabled]}
                  >
                    <Text style={[styles.value, styles.optionBody, { color: mode === 'full' ? '#D97706' : colors.foreground }]}>{label}</Text>
                    {selected ? <Check color={mode === 'full' ? '#D97706' : colors.foreground} size={18} /> : null}
                  </Pressable>;
                })}
              </View> : <Text style={[styles.readOnlyValue, { color: colors.subtle }]}>{t('thread.options.unavailable')}</Text>}
            </View>
            {workspace.error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.errorText }]}>{workspace.error}</Text> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  sheet: { maxHeight: '82%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 22, paddingRight: 14, paddingBottom: 18, gap: 8 },
  headerBody: { flex: 1 },
  title: { fontSize: 20, fontWeight: '600', lineHeight: 28 },
  subtitle: { marginTop: 5, fontSize: 13, lineHeight: 19 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 17, paddingBottom: 8, gap: 12 },
  section: { borderRadius: 20, padding: 15 },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  trigger: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  value: { flexShrink: 1, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  readOnlyValue: { paddingVertical: 10, fontSize: 15, lineHeight: 22 },
  detail: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  list: { marginTop: 10, gap: 8 },
  option: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionBody: { minWidth: 0, flex: 1 },
  pathInput: { minHeight: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  applyButton: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  applyText: { fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  error: { fontSize: 12, lineHeight: 18 },
});
