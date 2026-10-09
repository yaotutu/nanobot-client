import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { useChatScroll } from '@/features/chat/hooks/useChatScroll';
import type { TurnUnit } from '@/features/chat/activity/model/activity-timeline';
import type { UIMessage } from '@/types/api/chat/messages';

/** 构造倒置 FlatList 的几何与松手速度，区分静止松手和后续惯性滚动。 */
const makeScrollEvent = (
  offset: number,
  contentHeight = 2_000,
  layoutHeight = 500,
  velocityY = 0,
): NativeSyntheticEvent<NativeScrollEvent> => ({
  nativeEvent: {
    contentOffset: { x: 0, y: offset },
    contentSize: { height: contentHeight, width: 390 },
    layoutMeasurement: { height: layoutHeight, width: 390 },
    velocity: { x: 0, y: velocityY },
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
    // 中间位置同时存在“上方更早内容”和“下方最新内容”，两个方向入口都应可见。
    expect(result.current.canScrollToTop).toBe(true);
    expect(onLoadOlder).not.toHaveBeenCalled();

    // 距离虚拟 end 50px，接近视觉顶部，应触发一次旧消息分页。
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(1_450));
      // 同一轮拖拽内的相邻滚动事件不应重复发起请求。
      result.current.handleThreadScroll(makeScrollEvent(1_451));
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    // 回到 offset 0 附近，恢复自动跟随最新消息；上方历史入口保持可用。
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(20));
      result.current.handleContentSizeChange();
    });
    expect(result.current.atBottom).toBe(true);
    expect(result.current.canScrollToTop).toBe(true);
  });

  it('接近视觉顶部时隐藏向上入口，离开底部时保留向下入口', async () => {
    const onSessionReset = jest.fn();
    const { result } = await renderChatScroll({
      hasMoreBefore: false,
      onSessionReset,
    });
    // 等待会话切换重置定时器完成，避免它的 0ms 回调在测试滚动事件之后把状态误置回底部。
    await waitFor(() => expect(onSessionReset).toHaveBeenCalledTimes(1));

    // 视觉顶部对应虚拟 end；距离为 50px 时不再显示向上入口。
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(1_450));
    });
    expect(result.current.atBottom).toBe(false);
    expect(result.current.canScrollToTop).toBe(false);

    // 向最新的方向回退到中间位置，向上入口恢复，向下入口继续可用。
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(1_400));
    });
    expect(result.current.atBottom).toBe(false);
    expect(result.current.canScrollToTop).toBe(true);
  });

  it('切换会话后重置自动跟随状态', async () => {
    const onSessionReset = jest.fn();
    const onLoadOlder = jest.fn(async () => undefined);
    const initialProps = {
      activeKey: 'session-a',
      units: makeUnits(),
      loadingOlder: false,
      hasMoreBefore: false,
      onLoadOlder,
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
    expect(result.current.canScrollToTop).toBe(false);
    // 旧会话未结束的拖拽不能给新列表初始定位赋予自动分页资格。
    await act(async () => {
      rerender({ ...initialProps, activeKey: 'session-b', hasMoreBefore: true });
    });
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(1_450));
    });
    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it('松手后惯性进入 96px 阈值加载一页，直到下一手势才允许再次自动分页', async () => {
    const onLoadOlder = jest.fn(async () => undefined);
    const { result } = await renderChatScroll({ onLoadOlder });
    await act(async () => {});

    // 手指离开时还距历史边界 100px；分页阈值是在之后的惯性阶段才进入的。
    await act(async () => {
      result.current.onScrollBeginDrag();
      result.current.handleThreadScroll(makeScrollEvent(1_400));
      result.current.onScrollEndDrag(makeScrollEvent(1_400, 2_000, 500, 1));
    });
    expect(onLoadOlder).not.toHaveBeenCalled();
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(1_405));
      result.current.handleThreadScroll(makeScrollEvent(1_450));
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    // Promise 已完成后同一惯性阶段继续滚动，也不能重复请求同一历史页。
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(1_451));
      result.current.onMomentumScrollEnd();
      result.current.handleThreadScroll(makeScrollEvent(1_460));
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.onScrollBeginDrag();
      result.current.handleThreadScroll(makeScrollEvent(1_460));
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(2);
  });

  it('同一手势内已有历史请求在途时，请求结束后也不追加分页', async () => {
    const onLoadOlder = jest.fn(async () => undefined);
    const onSessionReset = jest.fn();
    const initialProps = {
      activeKey: 'session-a',
      units: makeUnits(),
      loadingOlder: true,
      hasMoreBefore: true,
      onLoadOlder,
      onSessionReset,
    };
    const { rerender, result } = await renderHook(
      (props: typeof initialProps) => useChatScroll(props),
      { initialProps },
    );
    await waitFor(() => expect(onSessionReset).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.onScrollBeginDrag();
      result.current.handleThreadScroll(makeScrollEvent(1_450));
    });
    expect(onLoadOlder).not.toHaveBeenCalled();

    // 旧请求结束后，该手势仍在阈值内也不重新获得自动分页资格。
    await act(async () => {
      rerender({ ...initialProps, loadingOlder: false });
      result.current.handleThreadScroll(makeScrollEvent(1_460));
    });
    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it('初次定位、静止松手和没有用户拖拽的惯性结束不自动分页', async () => {
    const onLoadOlder = jest.fn(async () => undefined);
    const { result } = await renderChatScroll({ onLoadOlder });
    await act(async () => {});
    await act(async () => {
      result.current.handleThreadScroll(makeScrollEvent(1_450));
      // 孤立 end-drag 不能把程序动画误认成用户惯性。
      result.current.onScrollEndDrag(makeScrollEvent(1_400, 2_000, 500, 1));
      result.current.handleThreadScroll(makeScrollEvent(1_450));
      result.current.onMomentumScrollEnd();
      result.current.onScrollBeginDrag();
      result.current.handleThreadScroll(makeScrollEvent(1_400));
      result.current.onScrollEndDrag(makeScrollEvent(1_400));
      result.current.handleThreadScroll(makeScrollEvent(1_450));
    });
    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it.each(['prompt', 'bottom', 'retry'] as const)('程序滚动 %s 撤销之前用户惯性的自动分页资格', async (target) => {
    const onLoadOlder = jest.fn(async () => undefined);
    const { result, unmount } = await renderChatScroll({ onLoadOlder });
    await act(async () => {});
    await act(async () => {
      result.current.onScrollBeginDrag();
      result.current.handleThreadScroll(makeScrollEvent(1_400));
      result.current.onScrollEndDrag(makeScrollEvent(1_400, 2_000, 500, -1));
      // 直接导航、回到底部与定位补偿都可能在用户惯性尚未结束时发生。
      if (target === 'prompt') result.current.jumpToPrompt('older-user');
      if (target === 'bottom') result.current.scrollToBottom(true, true);
      if (target === 'retry') result.current.handleScrollToIndexFailed({ averageItemLength: 100, index: 1 });
      result.current.handleThreadScroll(makeScrollEvent(1_450));
    });
    expect(onLoadOlder).not.toHaveBeenCalled();
    await unmount();
  });
});
