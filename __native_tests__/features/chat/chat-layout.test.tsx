import { describe, expect, it, jest } from '@jest/globals';
import { createRef, useEffect } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text, TextInput } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { ChatHeader } from '@/features/chat/components/ChatHeader';
import { ChatSurface } from '@/features/chat/components/ChatSurface';
import type { ChatThreadProps } from '@/features/chat/components/ChatThread';
import { Composer } from '@/features/chat/components/Composer';
import type { ComposerProps } from '@/features/chat/composer/model/view-contract';
import { chatPaletteForTheme } from '@/features/chat/ui/chat-theme';
import { AgentActivityCluster } from '@/features/chat/components/activity/AgentActivityCluster';
import { MessageRow } from '@/features/chat/components/messages/MessageRow';

// 复制仍走真实按钮逻辑，仅隔离系统剪贴板，避免 Native 测试调用设备能力。
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));
// 本组不测试视频播放，只隔离原生播放器的加载，媒体画廊与消息正文仍使用真实组件。
jest.mock('@/features/chat/components/widgets/inline-video-attachment', () => ({ InlineVideoAttachment: () => null }));

jest.mock('lucide-react-native/icons/list-tree', () => () => null);
jest.mock('lucide-react-native/icons/menu', () => () => null);
jest.mock('lucide-react-native/icons/sliders-horizontal', () => () => null);
jest.mock('lucide-react-native/icons/plus', () => () => null);
jest.mock('lucide-react-native/icons/arrow-up', () => () => null);
jest.mock('lucide-react-native/icons/square', () => () => null);
// 图标以 ESM 发布；只隔离不影响布局与点击回调的图标，保留消息、Markdown 和活动子组件的真实渲染。
jest.mock('lucide-react-native/icons/chevron-down', () => () => null);
jest.mock('lucide-react-native/icons/git-fork', () => () => null);
jest.mock('lucide-react-native/icons/quote', () => () => null);
jest.mock('lucide-react-native/icons/rotate-cw', () => () => null);
jest.mock('lucide-react-native/icons/check', () => () => null);
jest.mock('lucide-react-native/icons/copy', () => () => null);
jest.mock('lucide-react-native/icons/circle-alert', () => () => null);
jest.mock('lucide-react-native/icons/clock-3', () => () => null);
jest.mock('lucide-react-native/icons/file-search', () => () => null);
jest.mock('lucide-react-native/icons/folder-open', () => () => null);
jest.mock('lucide-react-native/icons/earth', () => () => null);
jest.mock('lucide-react-native/icons/memory-stick', () => () => null);
jest.mock('lucide-react-native/icons/play', () => () => null);
jest.mock('lucide-react-native/icons/search', () => () => null);
jest.mock('lucide-react-native/icons/server', () => () => null);
jest.mock('lucide-react-native/icons/terminal', () => () => null);
jest.mock('lucide-react-native/icons/wrench', () => () => null);
jest.mock('lucide-react-native/icons/chevron-right', () => () => null);
jest.mock('lucide-react-native/icons/chevron-up', () => () => null);
jest.mock('lucide-react-native/icons/circle-dashed', () => () => null);
jest.mock('lucide-react-native/icons/external-link', () => () => null);
jest.mock('lucide-react-native/icons/file-pen-line', () => () => null);
jest.mock('lucide-react-native/icons/file-code-corner', () => () => null);
jest.mock('lucide-react-native/icons/file-text', () => () => null);
jest.mock('lucide-react-native/icons/maximize-2', () => () => null);
jest.mock('lucide-react-native/icons/x', () => () => null);
jest.mock('lucide-react-native/icons/sliders-horizontal', () => () => null);

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
// 隔离延迟加载和业务子控件，测试真正的页面布局与输入行，不触发网络或原生附件选择。
jest.mock('@/hooks/use-deferred-component', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { createDeferredComponent: () => () => <MockText>thread-content</MockText> };
});
jest.mock('@/features/chat/components/widgets/run-goal-status', () => ({ RunGoalStatus: () => null }));
jest.mock('@/features/chat/components/ComposerSuggestions', () => ({ ComposerSuggestions: () => null }));
jest.mock('@/features/chat/components/ComposerContext', () => ({ ComposerContext: () => null }));

const createComposerProps = (): ComposerProps => ({
  appearance: { colors: chatPaletteForTheme(false), dark: false },
  inputRef: createRef<TextInput>(),
  attachments: { items: [], busy: false, error: null, full: false, readyCount: 0, onAdd: jest.fn(), onRemove: jest.fn() },
  draft: { value: '', quotedContext: null, onChangeText: jest.fn(), onClearQuote: jest.fn(), onCursorChange: jest.fn() },
  runtime: { disabled: false, queuedPrompts: [], runStartedAt: null, turnActive: false, onRemoveQueuedPrompt: jest.fn(), onSend: jest.fn(), onStop: jest.fn() },
  suggestions: { mentionCandidates: [], skillCandidates: [], slashCommands: [], onMentionSelect: jest.fn(), onSkillSelect: jest.fn(), onSlashCommandSelect: jest.fn() },
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

  it('顶部菜单、会话选项、标题导航可操作，不再提供主题快捷按钮', async () => {
    const props = { colors: chatPaletteForTheme(false), chatTitle: 'demo', hasUserPrompts: true, onOpenDrawer: jest.fn(), onOpenPromptNavigator: jest.fn(), onOpenChatOptions: jest.fn() };
    const result = await render(<ChatHeader {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'thread.header.toggleSidebar' }));
    await fireEvent.press(result.getByRole('button', { name: 'thread.composer.options' }));
    await fireEvent.press(result.getByRole('button', { name: 'thread.promptNavigator.open' }));
    expect(props.onOpenDrawer).toHaveBeenCalledTimes(1);
    expect(props.onOpenChatOptions).toHaveBeenCalledTimes(1);
    expect(props.onOpenPromptNavigator).toHaveBeenCalledTimes(1);
    expect(result.getAllByRole('button')).toHaveLength(3);
    expect(result.queryByRole('button', { name: 'sidebar.newChat' })).toBeNull();
    expect(result.getByRole('button', { name: 'thread.composer.options' })).toHaveStyle({ right: 20, width: 44, height: 44 });
    expect(result.getByText('app.brand')).toBeTruthy();
    expect(result.getByText('thread.header.subtitle')).toBeTruthy();
    expect(result.getByText('demo')).toBeTruthy();
  });

  it.each([false, true])('空会话也可从右上角打开选项（深色主题：%s）', async (dark) => {
    const onOpenChatOptions = jest.fn();
    const result = await render(<ChatHeader colors={chatPaletteForTheme(dark)} chatTitle="" hasUserPrompts={false}
      onOpenDrawer={jest.fn()} onOpenPromptNavigator={jest.fn()} onOpenChatOptions={onOpenChatOptions} />);
    // 空会话的标题胶囊只读，但配置入口仍可使用，便于发出第一条消息前选择模型和工作区。
    await fireEvent.press(result.getByRole('button', { name: 'thread.composer.options' }));
    expect(onOpenChatOptions).toHaveBeenCalledTimes(1);
    expect(result.queryByRole('button', { name: 'thread.promptNavigator.open' })).toBeNull();
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

  it('输入区只保留附件、文本和发送，不能再出现模型／工作区配置栏', async () => {
    const props = createComposerProps();
    const result = await render(<Composer {...props} />);
    expect(result.queryByLabelText('thread.composer.options')).toBeNull();
    expect(result.queryByText('settings.rows.currentModel')).toBeNull();
    expect(result.getAllByRole('button')).toHaveLength(2);
  });

});

// 消息视觉回归只覆盖卡片、辅助操作与活动区，不接管 header/composer/消息列表的布局断言。
// getByText 返回最内层 Text；正文尺寸来自外层 Text 的继承，沿父节点找到实际定义字号的位置再断言。
const textLayoutNode = (node: ReturnType<Awaited<ReturnType<typeof render>>['getByText']>): typeof node => (
  StyleSheet.flatten(node.props.style)?.fontSize !== undefined || !node.parent
    ? node
    : textLayoutNode(node.parent)
);

const createMessageRowProps = (dark = false): React.ComponentProps<typeof MessageRow> => ({
  message: { id: 'assistant-visual', role: 'assistant', content: 'hello-assistant', createdAt: 1, completedAt: 2 },
  colors: chatPaletteForTheme(dark), dark, cliApps: [], mcpPresets: [], slashCommands: [],
  forkIndex: 3, forkBusy: false, canRetry: true, isRetryBusy: false,
  onFork: jest.fn(), onRetry: jest.fn(async () => undefined), onQuote: jest.fn(),
});

describe('消息卡片与活动区的紧凑视觉', () => {
  it('Markdown 标题与段落按参考比例排版，保留正文 16/24', async () => {
    const props = createMessageRowProps();
    props.message = { ...props.message, content: '# 一级标题\n\n段落正文\n\n## 二级标题\n\n### 三级标题\n\n- 列表正文' };
    const result = await render(<MessageRow {...props} />);
    expect(StyleSheet.flatten(textLayoutNode(result.getByText('一级标题')).props.style)).toMatchObject({ fontSize: 21, lineHeight: 27 });
    expect(StyleSheet.flatten(textLayoutNode(result.getByText('二级标题')).props.style)).toMatchObject({ fontSize: 19, lineHeight: 25 });
    expect(StyleSheet.flatten(textLayoutNode(result.getByText('三级标题')).props.style)).toMatchObject({ fontSize: 17, lineHeight: 23 });
    expect(StyleSheet.flatten(textLayoutNode(result.getByText('段落正文')).props.style)).toMatchObject({ fontSize: 16, lineHeight: 24 });
    // 使用真实 Markdown 渲染结果验证留白，不把解析器替换成仅返回字符串的 mock。
    const paragraph = result.getByText('段落正文').parent?.parent;
    expect(StyleSheet.flatten(paragraph?.props.style)).toMatchObject({ marginTop: 0, marginBottom: 6 });
  });

  it.each([false, true])('助手灰卡沿用原版尾角与 95% 上限，正文 16/24、全部操作保留（dark=%s）', async (dark) => {
    const props = createMessageRowProps(dark);
    const result = await render(<MessageRow {...props} />);
    const card = result.container.queryAll((node) => StyleSheet.flatten(node.props.style)?.borderBottomLeftRadius === 7)[0];
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ maxWidth: '95%', borderRadius: 22, backgroundColor: props.colors.pressed });
    expect(textLayoutNode(result.getByText('hello-assistant'))).toHaveStyle({ fontSize: 16, lineHeight: 24 });
    const actions = ['message.copyReply', 'message.askAboutSelection', 'message.forkFromHere', 'message.retry'];
    for (const label of actions) {
      const action = result.getByLabelText(label);
      expect(action).toHaveStyle({ width: 36, height: 30 });
      expect(action.props.hitSlop).toBe(7);
      await fireEvent.press(action);
    }
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('hello-assistant');
    expect(result.getByLabelText('message.copiedReply')).toBeTruthy();
    expect(props.onQuote).toHaveBeenCalledWith('hello-assistant');
    expect(props.onFork).toHaveBeenCalledWith(3);
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(result.getByLabelText(/^message.turnLatencyTitle:/)).toBeTruthy();
  });

  it.each([false, true])('用户蓝气泡保留 85% 上限、右下尾角、引用上下文与原文复制（dark=%s）', async (dark) => {
    const props = createMessageRowProps(dark);
    const content = '> [!QUOTE]\n> quoted-assistant\n\nhello-user';
    const result = await render(<MessageRow {...props} message={{ id: 'user-visual', role: 'user', content, createdAt: 1 }} />);
    const bubble = result.container.queryAll((node) => StyleSheet.flatten(node.props.style)?.borderBottomRightRadius === 7)[0];
    expect(StyleSheet.flatten(bubble.props.style)).toMatchObject({ maxWidth: '85%', borderRadius: 22, backgroundColor: props.colors.userBubble, paddingHorizontal: 16, paddingVertical: 13 });
    expect(textLayoutNode(result.getByText('hello-user'))).toHaveStyle({ fontSize: 16, lineHeight: 24 });
    expect(result.getByText('quoted-assistant')).toBeTruthy();
    await fireEvent.press(result.getByLabelText('message.copyReply'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(content);
  });

  it('流式空回复占位收紧，但不提前显示完成后的辅助操作', async () => {
    const props = createMessageRowProps();
    const message = { ...props.message, content: '', completedAt: undefined, isStreaming: true };
    const result = await render(<MessageRow {...props} message={message} />);
    const placeholder = result.container.queryAll((node) => StyleSheet.flatten(node.props.style)?.minHeight === 36)[0];
    expect(StyleSheet.flatten(placeholder.props.style)).toMatchObject({ borderBottomLeftRadius: 7, backgroundColor: props.colors.pressed });
    expect(result.queryByLabelText('message.copyReply')).toBeNull();
    await result.rerender(<MessageRow {...props} message={{ ...message, content: 'streaming-answer' }} />);
    expect(textLayoutNode(result.getByText('streaming-answer'))).toHaveStyle({ fontSize: 16, lineHeight: 24 });
    expect(result.queryByLabelText('message.askAboutSelection')).toBeNull();
  });

  it('紧凑操作按钮仍遵守分支与重试的忙碌禁用状态', async () => {
    const props = createMessageRowProps();
    const result = await render(<MessageRow {...props} forkBusy isRetryBusy />);
    await fireEvent.press(result.getByLabelText('message.forkFromHere'));
    await fireEvent.press(result.getByLabelText('message.retry'));
    expect(props.onFork).not.toHaveBeenCalled();
    expect(props.onRetry).not.toHaveBeenCalled();
  });

  it('已完成活动默认折叠，收紧留白后仍可手动展开查看推理', async () => {
    const props = { colors: chatPaletteForTheme(false), hasBodyBelow: true, isTurnStreaming: false, messages: [{ id: 'reasoning-visual', role: 'assistant' as const, content: '', reasoning: 'reasoning-preview', createdAt: 1 }], turnLatencyMs: 2_000 };
    const result = await render(<AgentActivityCluster {...props} />);
    const header = result.getByRole('button');
    expect(header.props.accessibilityState.expanded).toBe(false);
    expect(header).toHaveStyle({ minHeight: 24 });
    expect(header.props.hitSlop).toBe(10);
    expect(result.getByText('message.activityThoughtFor')).toHaveStyle({ fontSize: 13, lineHeight: 18 });
    const cluster = result.container.queryAll((node) => StyleSheet.flatten(node.props.style)?.maxWidth === 720)[0];
    expect(StyleSheet.flatten(cluster.props.style)).toMatchObject({ width: '95%', marginBottom: 4 });
    expect(result.queryByText('reasoning-preview')).toBeNull();
    await fireEvent.press(header);
    expect(result.getByText('reasoning-preview')).toBeTruthy();
    const timeline = result.container.queryAll((node) => StyleSheet.flatten(node.props.style)?.maxHeight === 144)[0];
    expect(StyleSheet.flatten(timeline.props.style)).toMatchObject({ maxHeight: 144, marginTop: 2 });
    await fireEvent.press(result.getByRole('button'));
    expect(result.queryByText('reasoning-preview')).toBeNull();
  });

  it('流式活动保持自动展开，用户主动折叠后新内容不抢回展开状态', async () => {
    const props = { colors: chatPaletteForTheme(false), hasBodyBelow: false, isTurnStreaming: true, messages: [{ id: 'live-reasoning', role: 'assistant' as const, content: '', reasoning: 'live-preview', reasoningStreaming: true, createdAt: Date.now() }] };
    const result = await render(<AgentActivityCluster {...props} />);
    expect(result.getByRole('button').props.accessibilityState.expanded).toBe(true);
    expect(result.getByText('live-preview')).toBeTruthy();
    await fireEvent.press(result.getByRole('button'));
    await result.rerender(<AgentActivityCluster {...props} messages={[{ ...props.messages[0], reasoning: 'updated-preview' }]} />);
    expect(result.getByRole('button').props.accessibilityState.expanded).toBe(false);
    expect(result.queryByText('updated-preview')).toBeNull();
  });
});
