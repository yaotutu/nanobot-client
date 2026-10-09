import { describe, expect, it, jest } from '@jest/globals';
import { createRef } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';

import { ChatThread, type ChatThreadProps } from '@/features/chat/components/ChatThread';
import type { ChatThreadListRef } from '@/features/chat/hooks/useChatScroll';
import { DEFAULT_THEME_ID, resolveChatPalette, themeModeForDark } from '@/features/theme';
import type { UIMessage } from '@/types/api/chat/messages';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('lucide-react-native/icons/arrow-down', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  // 保留箭头的渲染位置与颜色参数，避免空 mock 掩盖图标被移除或配色回退。
  return (props: { color: string; size: number; strokeWidth: number }) => (
    <MockView testID="scroll-to-bottom-arrow" {...props} />
  );
});
jest.mock('@/features/chat/components/activity/AgentActivityCluster', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { AgentActivityCluster: () => <MockText>activity</MockText> };
});
jest.mock('@/features/chat/components/messages/MessageRow', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MessageRow: ({ message }: { message: UIMessage }) => <MockText>{message.id}</MockText> };
});
jest.mock('@/features/chat/components/messages/MessageRow.extras', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ForkBoundaryDivider: () => <MockText>fork-boundary</MockText> };
});

const user = (id: string): UIMessage => ({
  id,
  role: 'user',
  content: id,
  createdAt: 1,
  kind: 'message',
});

const assistant = (id: string): UIMessage => ({
  id,
  role: 'assistant',
  content: id,
  createdAt: 2,
  kind: 'message',
});

describe('倒置消息列表', () => {
  it('最新消息位于 FlatList 首位，业务索引仍按时间正序计算', async () => {
    const canRetryFromMessage = jest.fn((unit: UIMessage | { message: UIMessage }, index: number) => index === 1);
    const loadEarlier = jest.fn();
    const units = [
      { type: 'message' as const, message: user('old-user') },
      { type: 'message' as const, message: assistant('latest-assistant') },
    ];
    const result = await render(
      <ChatThread
        listRef={createRef<ChatThreadListRef>()}
        atBottom
        scrollToBottom={jest.fn()}
        loadEarlier={loadEarlier}
        handleThreadScroll={jest.fn()}
        handleContentSizeChange={jest.fn()}
        handleScrollToIndexFailed={jest.fn()}
        onMomentumScrollEnd={jest.fn()}
        onScrollBeginDrag={jest.fn()}
        onScrollEndDrag={jest.fn()}
        units={units}
        unitKeys={['old-user', 'latest-assistant']}
        forkIndexes={[undefined, 0]}
        forkBoundaryAfterUnitIndex={1}
        liveActivityClusterIndices={new Set()}
        forkingMessageId={null}
        retryingMessageId={null}
        colors={resolveChatPalette(DEFAULT_THEME_ID, 'light')}
        dark={false}
        cliApps={[]}
        mcpPresets={[]}
        slashCommands={[]}
        hasMoreBefore
        loadingOlder={false}
        canRetryFromMessage={canRetryFromMessage as never}
        forkFromMessage={jest.fn(async () => undefined)}
        retryFromMessage={jest.fn(() => jest.fn(async () => undefined))}
        resolveFilePreviewAvailability={jest.fn(async () => true)}
        onOpenFilePreview={undefined}
        onQuote={jest.fn()}
      />,
    );

    const list = result.getByTestId('chat-thread-list');
    expect(list.props.inverted).toBe(true);
    expect(list.props.initialNumToRender).toBe(12);
    expect(list.props.maxToRenderPerBatch).toBe(8);
    expect(list.props.windowSize).toBe(7);
    expect(list.props.data[0].unit.message.id).toBe('latest-assistant');
    expect(result.getByText('latest-assistant')).toBeTruthy();
    expect(result.getByText('fork-boundary')).toBeTruthy();
    expect(result.queryByLabelText('thread.scrollToBottom')).toBeNull();
    // 展示索引 0 对应时间线索引 1，避免倒置后破坏重试和 fork 的业务判断。
    expect(canRetryFromMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'message' }), 1);
    await fireEvent.press(result.getByLabelText('thread.loadEarlier'));
    expect(loadEarlier).toHaveBeenCalledTimes(1);
  });
});

describe('回到底部悬浮按钮', () => {
  // 使用完整且固定的列表输入，仅切换主题或 atBottom，避免把业务回调变化误判为布局变化。
  const createProps = (dark = false): ChatThreadProps => ({
    listRef: createRef<ChatThreadListRef>(),
    atBottom: false,
    scrollToBottom: jest.fn(),
    loadEarlier: jest.fn(),
    handleThreadScroll: jest.fn(),
    handleContentSizeChange: jest.fn(),
    handleScrollToIndexFailed: jest.fn(),
    onMomentumScrollEnd: jest.fn(),
    onScrollBeginDrag: jest.fn(),
    onScrollEndDrag: jest.fn(),
    units: [{ type: 'message', message: assistant('latest-assistant') }],
    unitKeys: ['latest-assistant'],
    forkIndexes: [undefined],
    forkBoundaryAfterUnitIndex: null,
    liveActivityClusterIndices: new Set(),
    forkingMessageId: null,
    retryingMessageId: null,
    colors: resolveChatPalette(DEFAULT_THEME_ID, themeModeForDark(dark)),
    dark,
    cliApps: [],
    mcpPresets: [],
    slashCommands: [],
    hasMoreBefore: false,
    loadingOlder: false,
    canRetryFromMessage: jest.fn(() => false),
    forkFromMessage: jest.fn(async () => undefined),
    retryFromMessage: jest.fn(() => jest.fn(async () => undefined)),
    resolveFilePreviewAvailability: jest.fn(async () => true),
    onOpenFilePreview: undefined,
    onQuote: jest.fn(),
  });

  it.each([false, true])('绝对定位且仅显示箭头，不挤占消息列表（dark=%s）', async (dark) => {
    const props = createProps(dark);
    const result = await render(<ChatThread {...props} />);
    const button = result.getByRole('button', { name: 'thread.scrollToBottom' });
    const list = result.getByTestId('chat-thread-list');

    // 原生渲染测试不执行真实布局；用绝对定位和列表外的结构约束回归“不占行”。
    expect(button).toHaveStyle({
      position: 'absolute',
      width: 44,
      height: 44,
      right: 14,
      bottom: 12,
      borderRadius: 22,
      backgroundColor: props.colors.userBubble,
    });
    expect(within(list).queryByLabelText('thread.scrollToBottom')).toBeNull();
    expect(result.queryByText('thread.latestMessages')).toBeNull();
    expect(within(button).queryAllByText(/.+/)).toHaveLength(0);
    expect(within(button).getByTestId('scroll-to-bottom-arrow').props.color).toBe(props.colors.userText);

    const listStyle = StyleSheet.flatten(list.props.style);
    const contentStyle = StyleSheet.flatten(list.props.contentContainerStyle);
    await result.rerender(<ChatThread {...props} atBottom />);
    // 显隐只影响悬浮入口，列表自身的间距和内容布局保持不变。
    const hiddenButtonList = result.getByTestId('chat-thread-list');
    expect(StyleSheet.flatten(hiddenButtonList.props.style)).toEqual(listStyle);
    expect(StyleSheet.flatten(hiddenButtonList.props.contentContainerStyle)).toEqual(contentStyle);
    expect(result.queryByLabelText('thread.scrollToBottom')).toBeNull();
  });

  it('点击强制动画滚动到底部，并随 atBottom 更新隐藏或重新显示', async () => {
    const props = createProps();
    const result = await render(<ChatThread {...props} />);

    await fireEvent.press(result.getByLabelText('thread.scrollToBottom'));
    expect(props.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(props.scrollToBottom).toHaveBeenCalledWith(true, true);

    // 实际滚动状态由父层回传；点击不能自行伪造已经到底的状态。
    expect(result.getByLabelText('thread.scrollToBottom')).toBeTruthy();
    await result.rerender(<ChatThread {...props} atBottom />);
    expect(result.queryByLabelText('thread.scrollToBottom')).toBeNull();
    await result.rerender(<ChatThread {...props} atBottom={false} />);
    expect(result.getByLabelText('thread.scrollToBottom')).toBeTruthy();
    expect(props.scrollToBottom).toHaveBeenCalledTimes(1);
  });
});
