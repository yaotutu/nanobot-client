import { describe, expect, it } from 'vitest';

import { chatIdFromKey } from '@/features/chat/model/chat-key';
import {
  mergeLatestMessages,
  prependOlderMessages,
  sameSemanticMessage,
} from '@/features/chat/store/message-reconciliation';
import type { UIMessage } from '@/types/api/chat';

const message = (
  id: string,
  content: string,
  overrides: Partial<UIMessage> = {},
): UIMessage => ({
  id,
  role: 'assistant',
  content,
  createdAt: 1,
  ...overrides,
});

describe('chat message reconciliation', () => {
  it('extracts chat ids from session keys', () => {
    expect(chatIdFromKey(null)).toBeNull();
    expect(chatIdFromKey('chat-1')).toBe('chat-1');
    expect(chatIdFromKey('websocket:chat-2')).toBe('chat-2');
  });

  it('matches by stable id or semantic message identity', () => {
    expect(sameSemanticMessage(
      message('same', 'old content'),
      message('same', 'new content'),
    )).toBe(true);
    expect(sameSemanticMessage(
      message('', 'Answer', { turnId: 'turn-1' }),
      message('', 'Answer', { turnId: 'turn-1' }),
    )).toBe(true);
    expect(sameSemanticMessage(
      message('', 'Answer', { turnId: 'turn-1' }),
      message('', 'Answer', { turnId: 'turn-2' }),
    )).toBe(false);
  });

  it('replaces an overlapping latest suffix without duplicating it', () => {
    const first = message('first', 'First', { role: 'user' });
    const overlap = message('overlap', 'Existing answer');
    const refreshedOverlap = message('overlap', 'Refreshed answer');
    const latest = message('latest', 'Latest answer');

    expect(mergeLatestMessages(
      [first, overlap],
      [refreshedOverlap, latest],
    )).toEqual([first, refreshedOverlap, latest]);
  });

  it('deduplicates fallback latest messages by id', () => {
    const current = [message('current', 'Current')];
    const latest = [
      message('new', 'New'),
      message('current', 'Server copy'),
    ];

    expect(mergeLatestMessages(current, latest).map((item) => item.id))
      .toEqual(['new', 'current']);
  });

  it('prepends only messages before the current boundary', () => {
    const boundary = message('boundary', 'Boundary');
    const current = [boundary, message('latest', 'Latest')];
    const older = [message('oldest', 'Oldest'), message('boundary', 'Boundary')];

    expect(prependOlderMessages(current, older).map((item) => item.id))
      .toEqual(['oldest', 'boundary', 'latest']);
    expect(prependOlderMessages(current, [])).toBe(current);
  });
});
