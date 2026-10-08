import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { useChatScroll } from '@/features/chat/hooks/useChatScroll';
import type { TurnUnit } from '@/features/chat/activity/model/activity-timeline';
import type { UIMessage } from '@/types/api/chat/messages';

/** 构造倒置 FlatList 的滚动事件，测试只需要这三个几何字段。 */
const makeScrollEvent = (
  offset: number,
  contentHeight = 2_000,
  layoutHeight = 500,
): NativeSyntheticEvent<NativeScrollEvent> => ({
  nativeEvent: {
    contentOffset: { x: 0, y: offset },
    contentSize: { height: contentHeight, width: 390 },
    layoutMeasurement: { height: layoutHeight, width: 390 },
  },
}) as NativeSyntheticEvent<NativeScrollEvent>;

const makeMessageUnit = (
  id: string,
  role: UIMessage['role'],
): TurnUnit => ({
  type: 'message',
  message: {
    id,
    role,
    content: id,
    createdAt: role === 'user' ? 1 : 2,
    kind: 'message',
  } satisfies UIMessage,
});

const makeUnits = (): TurnUnit[] => [
  makeMessageUnit('older-user', 'user'),
  makeMessageUnit('latest-assistant', 'assistant'),
];

interface TestHookOptions {
  activeKey?: string;
  hasMoreBefore?: boolean;
  onLoadOlder?: () => Promise<void>;
  onSessionReset?: () => void;
}

const renderChatScroll = async ({
  activeKey = 'session-a',
  hasMoreBefore = true,
  onLoadOlder = async () => undefined,
  onSessionReset = jest.fn(),
}: TestHookOptions) => renderHook(
  // 测试固定两条消息；滚动逻辑只关心几何状态，不依赖具体消息数量。
  (props: Required<TestHookOptions>) => useChatScroll({
    ...props,
    units: makeUnits(),
    loadingOlder: false,
  }),
  { initialProps: { activeKey, hasMoreBefore, onLoadOlder, onSessionReset } },
);

describe('倒置消息列表滚动 hook', () => {
  it('offset 0 表示视觉底部，接近虚拟 end 自动加载旧消息', async () => {
    const onLoadOlder = jest.fn(async () => undefined);
    const onSessionReset = jest.fn();
    const { result } = await renderChatScroll({ onLoadOlder, onSessionReset });

    // 让 effect 中的 0ms 重置定时器在 act 内完成，避免测试警告。
    await act(async () => {});
    await waitFor(() => expect(onSessionReset).toHaveBeenCalledTimes(1));
    expect(result.current.atBottom).toBe(true);

    // 距离虚拟 end 还有 100px，尚未进入加载阈值。
    await act(async () => {
      result.current.onScrollBeginDrag();
      result.current.handleThreadScroll(makeScrollEvent(1_400));
    });
    expect(result.current.atBottom).toBe(false);
    expect(onLoadOlder).not.toHaveBeenCalled();

    // 距离虚拟 end 50px，接近视觉顶部，应触发一次旧消息分页。
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(1_450));
      // 同一轮拖拽内的相邻滚动事件不应重复发起请求。
      result.current.handleThreadScroll(makeScrollEvent(1_451));
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    // 回到 offset 0 附近，恢复自动跟随最新消息。
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(20));
      result.current.handleContentSizeChange();
    });
    expect(result.current.atBottom).toBe(true);
  });

  it('切换会话后重置自动跟随状态', async () => {
    const onSessionReset = jest.fn();
    const initialProps = {
      activeKey: 'session-a',
      units: makeUnits(),
      loadingOlder: false,
      hasMoreBefore: false,
      onLoadOlder: async () => undefined,
      onSessionReset,
    };
    const { rerender, result } = await renderHook(
      (props: typeof initialProps) => useChatScroll(props),
      { initialProps },
    );
    await waitFor(() => expect(onSessionReset).toHaveBeenCalledTimes(1));

    // 用户先查看历史，离开视觉底部。
    await act(async () => {
      result.current.onScrollBeginDrag();
      result.current.handleThreadScroll(makeScrollEvent(1_400));
    });
    expect(result.current.atBottom).toBe(false);

    // 切换会话后，inverted 列表天然从底部开始，所以状态也回到底部。
    await act(async () => {
      rerender({ ...initialProps, activeKey: 'session-b' });
    });
    await waitFor(() => expect(onSessionReset).toHaveBeenCalledTimes(2));
    expect(result.current.atBottom).toBe(true);
  });
});
