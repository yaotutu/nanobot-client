import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { TurnUnit } from '@/features/chat/activity/model/activity-timeline';

const BOTTOM_THRESHOLD_PX = 72;
const OLDER_HISTORY_THRESHOLD_PX = 96;

/**
 * 聊天列表展示给 FlatList 的单元：数据源反向排列，最新消息在 index 0。
 * `unit` 仍保持时间线原始对象，便于业务索引与展示索引双向映射。
 */
export interface ChatDisplayUnit {
  key: string;
  unit: TurnUnit;
}

export type ChatThreadListRef = FlatList<ChatDisplayUnit> | null;

export interface UseChatScrollOptions {
  activeKey: string | null;
  units: TurnUnit[];
  loadingOlder: boolean;
  hasMoreBefore: boolean;
  onLoadOlder: () => Promise<void>;
  /** Called when the active session changes, for resetting non-scroll UI state. */
  onSessionReset?: () => void;
}

export interface UseChatScrollResult {
  listRef: React.RefObject<ChatThreadListRef>;
  atBottom: boolean;
  scrollToBottom: (animated?: boolean, force?: boolean) => void;
  loadEarlier: () => void;
  handleThreadScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleContentSizeChange: () => void;
  jumpToPrompt: (promptId: string) => void;
  handleScrollToIndexFailed: (info: {
    averageItemLength: number;
    index: number;
  }) => void;
  onMomentumScrollEnd: () => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: (event?: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

/**
 * Encapsulates FlatList scroll behaviour for the inverted chat thread.
 * The visual bottom is the virtual offset 0; older history is at the larger end.
 */
export function useChatScroll({
  activeKey,
  units,
  loadingOlder,
  hasMoreBefore,
  onLoadOlder,
  onSessionReset,
}: UseChatScrollOptions): UseChatScrollResult {
  const listRef = useRef<FlatList<ChatDisplayUnit>>(null);
  const autoFollowRef = useRef(true);
  const pendingPromptIndexRef = useRef<number | null>(null);
  const userScrollingRef = useRef(false);
  const olderLoadRequestedForGestureRef = useRef(false);
  const olderLoadInFlightRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);

  // Inverted 列表的最新消息固定在 offset 0，因此“到底”就是回零，无需
  // 在首屏渲染完成后做一次昂贵的 scrollToEnd。
  const scrollToBottom = useCallback((animated = true, force = false) => {
    if (force) autoFollowRef.current = true;
    if (autoFollowRef.current || force) {
      // 程序滚动不能继承尚未结束的用户惯性，否则回零后的布局事件可能误加载历史。
      userScrollingRef.current = false;
      listRef.current?.scrollToOffset({ animated, offset: 0 });
      setAtBottom(true);
    }
  }, []);

  // Reset scroll state when the active session changes. The list starts at the
  // visual bottom by construction, so there is intentionally no deferred scroll.
  useEffect(() => {
    autoFollowRef.current = true;
    pendingPromptIndexRef.current = null;
    userScrollingRef.current = false;
    olderLoadRequestedForGestureRef.current = false;
    // 会话切换后的默认“在底部”与新列表的初始渲染同步；异步批处理避免级联 render。
    const resetTimer = setTimeout(() => {
      setAtBottom(true);
      onSessionReset?.();
    }, 0);
    if (!activeKey) return () => clearTimeout(resetTimer);
    return () => clearTimeout(resetTimer);
  }, [activeKey, onSessionReset]);

  const loadEarlier = useCallback(() => {
    if (olderLoadInFlightRef.current || loadingOlder || !hasMoreBefore) return;
    olderLoadInFlightRef.current = true;
    void onLoadOlder().finally(() => {
      olderLoadInFlightRef.current = false;
    });
  }, [hasMoreBefore, loadingOlder, onLoadOlder]);

  const handleThreadScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      // Inverted 滚动中 offset 0 表示最新消息，也就是视觉底部。
      const nearBottom = contentOffset.y <= BOTTOM_THRESHOLD_PX;
      autoFollowRef.current = nearBottom;
      setAtBottom((current) => (current === nearBottom ? current : nearBottom));

      // 视觉顶部对应虚拟列表的 end；先计算到“更早消息边界”的距离。
      const distanceToOlderEnd = Math.max(
        0,
        contentSize.height - layoutMeasurement.height - contentOffset.y,
      );
      // 一次拖拽及其后续惯性最多请求一页；即使请求已经完成、阈值内继续收到
      // onScroll 或布局补偿事件，也必须等下一次用户拖拽才能再自动分页。
      if (
        userScrollingRef.current &&
        !olderLoadRequestedForGestureRef.current &&
        hasMoreBefore &&
        distanceToOlderEnd <= OLDER_HISTORY_THRESHOLD_PX
      ) {
        // 先消耗本次手势资格；如果当前已有历史请求在途，也等下一次用户手势。
        olderLoadRequestedForGestureRef.current = true;
        if (!olderLoadInFlightRef.current && !loadingOlder) loadEarlier();
      }
    },
    [hasMoreBefore, loadEarlier, loadingOlder],
  );

  const handleContentSizeChange = useCallback(() => {
    // 关注底部时，新内容插入 index 0 后仍在视觉底部；显式回零可容错 iOS 的位置补偿。
    if (autoFollowRef.current) scrollToBottom(false);
  }, [scrollToBottom]);

  const jumpToPrompt = useCallback(
    (promptId: string) => {
      const chronologicalIndex = units.findIndex(
        (unit) =>
          unit.type === 'message' &&
          unit.message.role === 'user' &&
          unit.message.id === promptId,
      );
      if (chronologicalIndex < 0) return;
      // 展示数组为“新到旧”，点击导航时要把时间线索引翻转成 FlatList 索引。
      const displayIndex = units.length - 1 - chronologicalIndex;
      // 导航产生的动画滚动不是用户继续查看历史，立即撤销自动分页资格。
      userScrollingRef.current = false;
      autoFollowRef.current = false;
      setAtBottom(false);
      pendingPromptIndexRef.current = displayIndex;
      listRef.current?.scrollToIndex({
        animated: true,
        index: displayIndex,
        viewOffset: 16,
        viewPosition: 0,
      });
    },
    [units],
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { averageItemLength: number; index: number }) => {
      // 定位失败后的补偿与重试同样属于程序滚动，不能延续之前手势的分页资格。
      userScrollingRef.current = false;
      pendingPromptIndexRef.current = info.index;
      listRef.current?.scrollToOffset({
        animated: false,
        offset: Math.max(0, info.averageItemLength * info.index),
      });
      setTimeout(() => {
        if (pendingPromptIndexRef.current !== info.index) return;
        listRef.current?.scrollToIndex({
          animated: true,
          index: info.index,
          viewOffset: 16,
          viewPosition: 0,
        });
        pendingPromptIndexRef.current = null;
      }, 120);
    },
    [],
  );

  const onMomentumScrollEnd = useCallback(() => {
    userScrollingRef.current = false;
  }, []);
  const onScrollBeginDrag = useCallback(() => {
    userScrollingRef.current = true;
    olderLoadRequestedForGestureRef.current = false;
  }, []);
  const onScrollEndDrag = useCallback((event?: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Native end-drag 携带松手速度：有纵向速度时用户滚动继续进入惯性阶段，
    // 直到 momentum-end 才清除；静止松手不会收到该事件，必须在这里立即结束。
    // 只延续既有用户手势，不让程序滚动或孤立的 end-drag 获得自动分页资格。
    userScrollingRef.current = userScrollingRef.current && Boolean(event?.nativeEvent.velocity?.y);
  }, []);

  return {
    listRef,
    atBottom,
    scrollToBottom,
    loadEarlier,
    handleThreadScroll,
    handleContentSizeChange,
    jumpToPrompt,
    handleScrollToIndexFailed,
    onMomentumScrollEnd,
    onScrollBeginDrag,
    onScrollEndDrag,
  };
}
