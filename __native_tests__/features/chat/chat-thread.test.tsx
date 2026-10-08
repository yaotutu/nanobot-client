import { describe, expect, it, jest } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { ChatThread } from '@/features/chat/components/ChatThread';
import type { ChatThreadListRef } from '@/features/chat/hooks/useChatScroll';
import { chatPaletteForTheme } from '@/features/chat/ui/chat-theme';
import type { UIMessage } from '@/types/api/chat/messages';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('lucide-react-native/icons/arrow-down', () => () => null);
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
        colors={chatPaletteForTheme(false)}
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
    // 展示索引 0 对应时间线索引 1，避免倒置后破坏重试和 fork 的业务判断。
    expect(canRetryFromMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'message' }), 1);
    await fireEvent.press(result.getByLabelText('thread.loadEarlier'));
    expect(loadEarlier).toHaveBeenCalledTimes(1);
  });
});
