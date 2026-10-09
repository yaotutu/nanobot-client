import { describe, expect, it, jest } from '@jest/globals';
import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { TextInput } from 'react-native';

import { ChatOptionsModal } from '@/features/chat/components/modals/ChatOptionsModal';
import { Composer } from '@/features/chat/components/Composer';
import type { ComposerProps } from '@/features/chat/composer/model/view-contract';
import { DEFAULT_THEME_ID, resolveChatPalette, themeModeForDark } from '@/features/theme';
import type { ModelPresetInfo } from '@/types/api/chat/models';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('lucide-react-native/icons/check', () => () => null);
jest.mock('lucide-react-native/icons/chevron-down', () => () => null);
jest.mock('lucide-react-native/icons/x', () => () => null);
jest.mock('lucide-react-native/icons/plus', () => () => null);
jest.mock('lucide-react-native/icons/arrow-up', () => () => null);
jest.mock('lucide-react-native/icons/square', () => () => null);
jest.mock('@/features/chat/components/widgets/run-goal-status', () => ({ RunGoalStatus: () => null }));
jest.mock('@/features/chat/components/ComposerSuggestions', () => ({ ComposerSuggestions: () => null }));
jest.mock('@/features/chat/components/ComposerContext', () => ({ ComposerContext: () => null }));

const preset = (name: string): ModelPresetInfo => ({ name, label: name, model: name, provider: 'provider', active: name === 'first', is_default: false, max_tokens: 1024, context_window_tokens: 4096, temperature: 0.7, reasoning_effort: null });
const createProps = (): React.ComponentProps<typeof ChatOptionsModal> => ({
  colors: resolveChatPalette(DEFAULT_THEME_ID, 'light'), disabled: false, turnActive: false, canChangeProject: true, onClose: jest.fn(),
  hasUserPrompts: true, onOpenPromptNavigator: jest.fn(),
  model: { activeModelPreset: 'first', modelDisplayLabel: 'First model', orderedModelPresets: [preset('first'), preset('second')], changeModelPreset: jest.fn(async () => undefined) },
  workspace: {
    activeScope: { project_path: '/workspace/demo', project_name: 'demo', access_mode: 'restricted', restrict_to_workspace: true },
    catalog: { schema_version: 1, default_access_mode: 'default', default_scope: { project_path: '/workspace/default', project_name: 'default', access_mode: 'restricted', restrict_to_workspace: true }, controls: { can_change_project: true, can_use_full_access: true } },
    error: null, updateScope: jest.fn(),
  },
});
const composerProps = (): ComposerProps => ({
  inputRef: createRef<TextInput>(), appearance: { colors: resolveChatPalette(DEFAULT_THEME_ID, 'light'), dark: false },
  draft: { value: 'draft preserved', quotedContext: null, onChangeText: jest.fn(), onClearQuote: jest.fn(), onCursorChange: jest.fn() },
  attachments: { items: [], busy: false, error: null, full: false, readyCount: 0, onAdd: jest.fn(), onRemove: jest.fn() },
  runtime: { disabled: false, turnActive: false, runStartedAt: null, queuedPrompts: [], onSend: jest.fn(), onStop: jest.fn(), onRemoveQueuedPrompt: jest.fn() },
  suggestions: { mentionCandidates: [], skillCandidates: [], slashCommands: [], onMentionSelect: jest.fn(), onSkillSelect: jest.fn(), onSlashCommandSelect: jest.fn() },
});

describe('统一聊天选项弹窗', () => {
  it('消息导航从聊天选项打开，空会话时禁用', async () => {
    const props = createProps();
    const result = await render(<ChatOptionsModal {...props} />);
    await fireEvent.press(result.getByLabelText('thread.promptNavigator.open'));
    expect(props.onOpenPromptNavigator).toHaveBeenCalledTimes(1);
    await result.rerender(<ChatOptionsModal {...props} hasUserPrompts={false} />);
    expect(result.getByLabelText('thread.promptNavigator.open').props.accessibilityState.disabled).toBe(true);
  });

  it.each([false, true])('三项配置只使用一个原生弹窗（dark=%s）', async (dark) => {
    const props = createProps();
    const result = await render(<ChatOptionsModal {...props} colors={resolveChatPalette(DEFAULT_THEME_ID, themeModeForDark(dark))} />);
    expect(result.getByText('thread.composer.options')).toBeTruthy();
    expect(result.getByText('settings.overview.workspace')).toBeTruthy();
    expect(result.getByText('thread.composer.workspace.accessAria')).toBeTruthy();
    expect(result.getAllByTestId('chat-options-modal')).toHaveLength(1);
    await fireEvent.press(result.getByLabelText('settings.rows.currentModel: First model'));
    expect(result.getAllByTestId('chat-options-modal')).toHaveLength(1);
    await fireEvent.press(result.getByLabelText('settings.rows.selectedPreset: second'));
    expect(props.model.changeModelPreset).toHaveBeenCalledWith('second');
    expect(result.queryByLabelText('settings.rows.selectedPreset: second')).toBeNull();
  });

  it('模型切换失败保留列表，不误报成功', async () => {
    const props = createProps();
    props.model.changeModelPreset = jest.fn(async () => { throw new Error('failed'); });
    const result = await render(<ChatOptionsModal {...props} />);
    await fireEvent.press(result.getByLabelText('settings.rows.currentModel: First model'));
    await fireEvent.press(result.getByLabelText('settings.rows.selectedPreset: second'));
    expect(result.getByLabelText('settings.rows.selectedPreset: second')).toBeTruthy();
    await fireEvent.press(result.getByLabelText('settings.rows.selectedPreset: first'));
    expect(props.model.changeModelPreset).toHaveBeenCalledTimes(1);
    expect(result.queryByLabelText('settings.rows.selectedPreset: second')).toBeNull();
  });

  it('模型提交中的重复点击不能产生并发请求', async () => {
    const props = createProps();
    let finish = () => {};
    props.model.changeModelPreset = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const result = await render(<ChatOptionsModal {...props} />);
    await fireEvent.press(result.getByLabelText('settings.rows.currentModel: First model'));
    await fireEvent.press(result.getByLabelText('settings.rows.selectedPreset: second'));
    await fireEvent.press(result.getByLabelText('settings.rows.selectedPreset: first'));
    expect(props.model.changeModelPreset).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it('权限修改保留路径，并同步 restrict_to_workspace', async () => {
    const props = createProps();
    const result = await render(<ChatOptionsModal {...props} />);
    await fireEvent.press(result.getByLabelText('thread.composer.workspace.full'));
    expect(props.workspace.updateScope).toHaveBeenCalledWith({ ...props.workspace.activeScope, access_mode: 'full', restrict_to_workspace: false });
    await result.rerender(<ChatOptionsModal {...props} workspace={{ ...props.workspace, activeScope: { ...props.workspace.activeScope!, access_mode: 'full', restrict_to_workspace: false } }} />);
    await fireEvent.press(result.getByLabelText('thread.composer.workspace.default'));
    expect(props.workspace.updateScope).toHaveBeenLastCalledWith(props.workspace.activeScope);
  });

  it('工作区路径验证和默认项目继续保留当前权限', async () => {
    const props = createProps();
    props.workspace.activeScope = { ...props.workspace.activeScope!, access_mode: 'full', restrict_to_workspace: false };
    const result = await render(<ChatOptionsModal {...props} />);
    await fireEvent.press(result.getByLabelText('thread.composer.workspace.projectAria'));
    await fireEvent.changeText(result.getByLabelText('workspace.dialog.manual'), 'relative/path');
    await fireEvent.press(result.getByLabelText('workspace.dialog.usePath'));
    expect(result.getByText('workspace.dialog.absolutePathRequired')).toBeTruthy();
    expect(props.workspace.updateScope).not.toHaveBeenCalled();
    await fireEvent.changeText(result.getByLabelText('workspace.dialog.manual'), ' /workspace/another ');
    await fireEvent.press(result.getByLabelText('workspace.dialog.usePath'));
    expect(props.workspace.updateScope).toHaveBeenCalledWith({ ...props.workspace.activeScope, project_path: '/workspace/another', project_name: 'another' });
    await fireEvent.press(result.getByLabelText('thread.composer.workspace.projectAria'));
    await fireEvent.press(result.getByLabelText('workspace.dialog.defaultProject'));
    expect(props.workspace.updateScope).toHaveBeenLastCalledWith({ ...props.workspace.activeScope, project_path: '/workspace/default', project_name: 'default' });
  });

  it.each([false, true])('已有会话／服务端限制时工作区只读，但仍显示路径（serverBlocked=%s）', async (serverBlocked) => {
    const props = createProps();
    const result = await render(<ChatOptionsModal {...props} canChangeProject={serverBlocked} workspace={{ ...props.workspace, catalog: { ...props.workspace.catalog!, controls: { can_change_project: !serverBlocked, can_use_full_access: true } } }} />);
    expect(result.queryByLabelText('thread.composer.workspace.projectAria')).toBeNull();
    expect(result.getByText('/workspace/demo')).toBeTruthy();
    expect(result.getByText('thread.options.projectLocked')).toBeTruthy();
  });

  it('连接禁用／运行回合禁止改权限或工作区，服务端可禁止完全访问', async () => {
    const props = createProps();
    const result = await render(<ChatOptionsModal {...props} turnActive />);
    await fireEvent.press(result.getByLabelText('thread.composer.workspace.full'));
    await fireEvent.press(result.getByLabelText('thread.composer.workspace.projectAria'));
    expect(props.workspace.updateScope).not.toHaveBeenCalled();
    expect(result.queryByLabelText('workspace.dialog.manual')).toBeNull();
    await result.rerender(<ChatOptionsModal {...props} disabled />);
    await fireEvent.press(result.getByLabelText('settings.rows.currentModel: First model'));
    expect(result.queryByLabelText('settings.rows.selectedPreset: second')).toBeNull();
    await result.rerender(<ChatOptionsModal {...props} workspace={{ ...props.workspace, catalog: { ...props.workspace.catalog!, controls: { can_change_project: true, can_use_full_access: false } } }} />);
    await fireEvent.press(result.getByLabelText('thread.composer.workspace.full'));
    expect(props.workspace.updateScope).not.toHaveBeenCalled();
  });

  it('只有一个模型／无工作区时不造可用配置，服务端错误仍可见', async () => {
    const props = createProps();
    const result = await render(<ChatOptionsModal {...props} model={{ ...props.model, orderedModelPresets: [preset('first')] }} workspace={{ ...props.workspace, activeScope: null, catalog: null, error: 'workspace failed' }} />);
    await fireEvent.press(result.getByLabelText('settings.rows.currentModel: First model'));
    expect(result.queryByLabelText('settings.rows.selectedPreset: first')).toBeNull();
    expect(result.queryByLabelText('thread.composer.workspace.full')).toBeNull();
    expect(result.getByRole('alert').props.children).toBe('workspace failed');
  });

  it('遮罩、关闭按钮和 Android 返回均关闭弹窗，开关弹窗不重挂输入框', async () => {
    const props = createProps();
    const inputProps = composerProps();
    const view = (open: boolean) => <><Composer {...inputProps} />{open ? <ChatOptionsModal {...props} /> : null}</>;
    const result = await render(view(false));
    const input = result.getByLabelText('thread.composer.inputAria');
    await result.rerender(view(true));
    // 原生 Modal 遮住主界面时，输入节点仍保留；查询时显式包含无障碍树中的隐藏节点。
    expect(result.getByLabelText('thread.composer.inputAria', { includeHiddenElements: true })).toBe(input);
    for (const button of result.getAllByLabelText('common.dismiss', { includeHiddenElements: true })) await fireEvent.press(button);
    await fireEvent(result.getByTestId('chat-options-modal'), 'requestClose');
    expect(props.onClose).toHaveBeenCalledTimes(3);
    await result.rerender(view(false));
    expect(result.getByLabelText('thread.composer.inputAria')).toBe(input);
    expect(input.props.value).toBe('draft preserved');
  });
});
