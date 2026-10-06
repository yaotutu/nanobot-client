import { describe, expect, it, jest } from '@jest/globals';
import { createRef, useEffect } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Text, TextInput } from 'react-native';

import { ChatHeader } from '@/features/chat/components/ChatHeader';
import { ChatSurface } from '@/features/chat/components/ChatSurface';
import type { ChatThreadProps } from '@/features/chat/components/ChatThread';
import { Composer } from '@/features/chat/components/Composer';
import type { ComposerProps } from '@/features/chat/composer/model/view-contract';
import { chatPaletteForTheme } from '@/features/chat/ui/chat-theme';

jest.mock('lucide-react-native/icons/list-tree', () => () => null);
jest.mock('lucide-react-native/icons/menu', () => () => null);
jest.mock('lucide-react-native/icons/square-pen', () => () => null);
jest.mock('lucide-react-native/icons/plus', () => () => null);
jest.mock('lucide-react-native/icons/arrow-up', () => () => null);
jest.mock('lucide-react-native/icons/square', () => () => null);

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
// 隔离延迟加载和业务子控件，测试真正的页面布局与输入行，不触发网络或原生附件选择。
jest.mock('@/hooks/use-deferred-component', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { createDeferredComponent: () => () => <MockText>thread-content</MockText> };
});
jest.mock('@/features/chat/components/widgets/run-goal-status', () => ({ RunGoalStatus: () => null }));
jest.mock('@/features/chat/components/widgets/model-preset-menu', () => ({ ModelPresetMenu: () => null }));
jest.mock('@/features/chat/components/ComposerSuggestions', () => ({ ComposerSuggestions: () => null }));
jest.mock('@/features/chat/components/ComposerContext', () => ({ ComposerContext: () => null }));
jest.mock('@/features/workspaces', () => ({ WorkspaceAccessMenu: () => null, WorkspaceProjectPicker: () => null }));

const createComposerProps = (): ComposerProps => ({
  appearance: { colors: chatPaletteForTheme(false), dark: false },
  inputRef: createRef<TextInput>(),
  attachments: { items: [], busy: false, error: null, full: false, readyCount: 0, onAdd: jest.fn(), onRemove: jest.fn() },
  draft: { value: '', quotedContext: null, onChangeText: jest.fn(), onClearQuote: jest.fn(), onCursorChange: jest.fn() },
  model: { activePreset: '', displayName: '', presets: [], onChange: jest.fn(async () => undefined) },
  runtime: { disabled: false, queuedPrompts: [], runStartedAt: null, turnActive: false, onRemoveQueuedPrompt: jest.fn(), onSend: jest.fn(), onStop: jest.fn() },
  suggestions: { mentionCandidates: [], skillCandidates: [], slashCommands: [], onMentionSelect: jest.fn(), onSkillSelect: jest.fn(), onSlashCommandSelect: jest.fn() },
  workspace: { canChangeProject: true, controls: null, defaultScope: null, disabled: false, error: null, scope: null, onChange: jest.fn() },
});

describe('聊天页唯一布局', () => {
  it('空会话、历史加载、对话之间切换不卸载或重复挂载输入区', async () => {
    const mount = jest.fn();
    const unmount = jest.fn();
    function ComposerProbe() {
      useEffect(() => { mount(); return () => { unmount(); }; }, []);
      return <Text>persistent-composer</Text>;
    }
    const props = { colors: chatPaletteForTheme(false), composer: <ComposerProbe />, hasMessages: false, threadLoading: false, threadProps: {} as ChatThreadProps };
    const result = await render(<ChatSurface {...props} />);
    expect(result.getByText('thread.empty.title')).toBeTruthy();
    await result.rerender(<ChatSurface {...props} threadLoading />);
    expect(result.getByText('thread.loadingConversation')).toBeTruthy();
    await result.rerender(<ChatSurface {...props} hasMessages />);
    expect(result.getByText('thread-content')).toBeTruthy();
    expect(result.getAllByText('persistent-composer')).toHaveLength(1);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(unmount).not.toHaveBeenCalled();
  });

  it('顶部菜单、新会话、标题导航可操作，不再提供主题快捷按钮', async () => {
    const props = { colors: chatPaletteForTheme(false), chatTitle: 'demo', hasUserPrompts: true, onOpenDrawer: jest.fn(), onOpenPromptNavigator: jest.fn(), onStartNewChat: jest.fn() };
    const result = await render(<ChatHeader {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'thread.header.toggleSidebar' }));
    await fireEvent.press(result.getByRole('button', { name: 'sidebar.newChat' }));
    await fireEvent.press(result.getByRole('button', { name: 'thread.promptNavigator.open' }));
    expect(props.onOpenDrawer).toHaveBeenCalledTimes(1);
    expect(props.onStartNewChat).toHaveBeenCalledTimes(1);
    expect(props.onOpenPromptNavigator).toHaveBeenCalledTimes(1);
    expect(result.getAllByRole('button')).toHaveLength(3);
  });

  it('空草稿不可发送；文本输入、光标、附件和发送继续委派给原控制器', async () => {
    const props = createComposerProps();
    const result = await render(<Composer {...props} />);
    expect(result.getByRole('button', { name: 'thread.composer.send' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(result.getByLabelText('thread.composer.inputAria'), 'hello');
    await fireEvent(result.getByLabelText('thread.composer.inputAria'), 'selectionChange', { nativeEvent: { selection: { start: 2 } } });
    await fireEvent.press(result.getByRole('button', { name: 'thread.composer.attachImage' }));
    expect(props.draft.onChangeText).toHaveBeenCalledWith('hello');
    expect(props.draft.onCursorChange).toHaveBeenCalledWith(2);
    expect(props.attachments.onAdd).toHaveBeenCalledTimes(1);
    await result.rerender(<Composer {...props} draft={{ ...props.draft, value: 'hello' }} />);
    await fireEvent.press(result.getByRole('button', { name: 'thread.composer.send' }));
    expect(props.runtime.onSend).toHaveBeenCalledTimes(1);
    expect(result.getByPlaceholderText('thread.composer.placeholder')).toBeTruthy();
  });

  it('运行时无草稿为停止按钮，有草稿则可发送引导提示', async () => {
    const props = createComposerProps();
    props.runtime.turnActive = true;
    const result = await render(<Composer {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'thread.composer.stop' }));
    expect(props.runtime.onStop).toHaveBeenCalledTimes(1);
    await result.rerender(<Composer {...props} draft={{ ...props.draft, value: 'follow up' }} />);
    await fireEvent.press(result.getByRole('button', { name: 'thread.composer.send' }));
    expect(props.runtime.onSend).toHaveBeenCalledTimes(1);
  });

  it('附件上传和连接禁用时不能发送，已就绪附件或引用也可以单独发送', async () => {
    const props = createComposerProps();
    props.attachments.readyCount = 1;
    const result = await render(<Composer {...props} />);
    expect(result.getByRole('button', { name: 'thread.composer.send' }).props.accessibilityState.disabled).toBe(false);
    await result.rerender(<Composer {...props} attachments={{ ...props.attachments, busy: true }} />);
    expect(result.getByRole('button', { name: 'thread.composer.send' }).props.accessibilityState.disabled).toBe(true);
    await result.rerender(<Composer {...props} runtime={{ ...props.runtime, disabled: true }} />);
    expect(result.getByRole('button', { name: 'thread.composer.send' }).props.accessibilityState.disabled).toBe(true);
    await result.rerender(<Composer {...props} attachments={{ ...props.attachments, readyCount: 0 }} draft={{ ...props.draft, quotedContext: 'quote' }} />);
    expect(result.getByRole('button', { name: 'thread.composer.send' }).props.accessibilityState.disabled).toBe(false);
  });
});
