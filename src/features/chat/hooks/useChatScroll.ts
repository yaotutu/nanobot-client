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
  onScrollEndDrag: () => void;
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
  const olderLoadInFlightRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);

  // Inverted 列表的最新消息固定在 offset 0，因此“到底”就是回零，无需
  // 在首屏渲染完成后做一次昂贵的 scrollToEnd。
  const scrollToBottom = useCallback((animated = true, force = false) => {
    if (force) autoFollowRef.current = true;
    if (autoFollowRef.current || force) {
      listRef.current?.scrollToOffset({ animated, offset: 0 });
      setAtBottom(true);
    }
  }, []);

  // Reset scroll state when the active session changes. The list starts at the
  // visual bottom by construction, so there is intentionally no deferred scroll.
  useEffect(() => {
    autoFollowRef.current = true;
    pendingPromptIndexRef.current = null;
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

      // 视觉顶部对应虚拟列表的 end；接近历史边界时继续向服务端加载更早消息。
      const distanceToOlderEnd = Math.max(
        0,
        contentSize.height - layoutMeasurement.height - contentOffset.y,
      );
      if (userScrollingRef.current && distanceToOlderEnd <= OLDER_HISTORY_THRESHOLD_PX) {
        loadEarlier();
      }
    },
    [loadEarlier],
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
  }, []);
  const onScrollEndDrag = useCallback(() => {
    userScrollingRef.current = false;
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
