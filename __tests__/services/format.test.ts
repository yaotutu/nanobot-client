import { describe, expect, it } from 'vitest';

import { sessionTitle, visibleSessionPreview } from '@/services/text/format';
import type { ChatSummary } from '@/types/api/sidebar';

describe('sessionTitle', () => {
  it('returns override title when present', () => {
    const session: ChatSummary = {
      key: 'ws:1',
      channel: 'ws',
      chatId: '1',
      createdAt: null,
      updatedAt: null,
      title: 'API',
      preview: '',
    };
    expect(sessionTitle(session)).toBe('API');
  });

  it('returns title from session', () => {
    const session: ChatSummary = {
      key: 'ws:1',
      channel: 'ws',
      chatId: '1',
      createdAt: null,
      updatedAt: null,
      title: 'Hello World',
      preview: '',
    };
    expect(sessionTitle(session)).toBe('Hello World');
  });

  it('falls back to preview when title is empty', () => {
    const session: ChatSummary = {
      key: 'ws:1',
      channel: 'ws',
      chatId: '1',
      createdAt: null,
      updatedAt: null,
      title: '',
      preview: 'Some preview content',
    };
    expect(sessionTitle(session)).toBe('Some preview content');
  });

  it('returns "new chat" fallback when both are empty', () => {
    const session: ChatSummary = {
      key: 'ws:1',
      channel: 'ws',
      chatId: '1',
      createdAt: null,
      updatedAt: null,
      title: '',
      preview: '',
    };
    expect(sessionTitle(session, 'new chat')).toBe('new chat');
  });
});

describe('visibleSessionPreview', () => {
  it('returns preview when present', () => {
    expect(visibleSessionPreview('preview text')).toBe('preview text');
  });

  it('returns empty string fallback for empty preview', () => {
    expect(visibleSessionPreview('')).toBe('');
  });
});
