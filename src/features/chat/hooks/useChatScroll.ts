import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { TurnUnit } from '@/features/chat/activity-timeline';
import type { UIMessage } from '@/types/api';

const BOTTOM_THRESHOLD_PX = 72;

export interface UseChatScrollOptions {
  activeKey: string | null;
  hasMessages: boolean;
  messages: UIMessage[];
  units: TurnUnit[];
  loadingOlder: boolean;
  hasMoreBefore: boolean;
  onLoadOlder: () => Promise<void>;
  /** Called when the active session changes, for resetting non-scroll UI state. */
  onSessionReset?: () => void;
}

export interface UseChatScrollResult {
  listRef: React.RefObject<FlatList<TurnUnit> | null>;
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
 * Encapsulates FlatList scroll behaviour for the chat thread: auto-follow,
 * "load earlier" pull, scroll-to-bottom affordance, and prompt navigation.
 */
export function useChatScroll({
  activeKey,
  hasMessages,
  messages,
  units,
  loadingOlder,
  hasMoreBefore,
  onLoadOlder,
  onSessionReset,
}: UseChatScrollOptions): UseChatScrollResult {
  const listRef = useRef<FlatList<TurnUnit>>(null);
  const firstMessageIdRef = useRef<string | null>(null);
  const autoFollowRef = useRef(true);
  const pendingPromptIndexRef = useRef<number | null>(null);
  const userScrollingRef = useRef(false);
  const olderLoadInFlightRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((animated = true, force = false) => {
    if (force) autoFollowRef.current = true;
    if (autoFollowRef.current || force) {
      listRef.current?.scrollToEnd({ animated });
      setAtBottom(true);
    }
  }, []);

  // Reset scroll state when the active session changes.
  useEffect(() => {
    autoFollowRef.current = true;
    pendingPromptIndexRef.current = null;
    firstMessageIdRef.current = null;
    const resetTimer = setTimeout(() => {
      setAtBottom(true);
      onSessionReset?.();
    }, 0);
    if (!activeKey) return () => clearTimeout(resetTimer);
    const scrollTimer = setTimeout(() => scrollToBottom(false, true), 80);
    return () => {
      clearTimeout(resetTimer);
      clearTimeout(scrollTimer);
    };
  }, [activeKey, scrollToBottom, onSessionReset]);

  // Auto-scroll to bottom when new messages arrive (if following).
  useEffect(() => {
    if (!hasMessages) return;
    const firstMessageId = messages[0]?.id ?? null;
    const prependedOlderMessages =
      firstMessageIdRef.current !== null && firstMessageIdRef.current !== firstMessageId;
    firstMessageIdRef.current = firstMessageId;
    if (prependedOlderMessages || !autoFollowRef.current) return;
    const timer = setTimeout(() => scrollToBottom(false), 40);
    return () => clearTimeout(timer);
  }, [hasMessages, messages, scrollToBottom]);

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
      const distance = Math.max(
        0,
        contentSize.height - layoutMeasurement.height - contentOffset.y,
      );
      const nearBottom = distance <= BOTTOM_THRESHOLD_PX;
      autoFollowRef.current = nearBottom;
      setAtBottom((current) => (current === nearBottom ? current : nearBottom));
      if (userScrollingRef.current && contentOffset.y <= 96) loadEarlier();
    },
    [loadEarlier],
  );

  const handleContentSizeChange = useCallback(() => {
    if (!autoFollowRef.current) return;
    scrollToBottom(false);
  }, [scrollToBottom]);

  const jumpToPrompt = useCallback(
    (promptId: string) => {
      const index = units.findIndex(
        (unit) =>
          unit.type === 'message' &&
          unit.message.role === 'user' &&
          unit.message.id === promptId,
      );
      if (index < 0) return;
      autoFollowRef.current = false;
      setAtBottom(false);
      pendingPromptIndexRef.current = index;
      listRef.current?.scrollToIndex({
        animated: true,
        index,
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
