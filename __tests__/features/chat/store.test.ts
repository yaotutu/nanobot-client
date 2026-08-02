import { beforeEach, describe, expect, it } from 'vitest';

import { useChatStore } from '@/features/chat/store';

describe('useChatStore run lifecycle', () => {
  beforeEach(() => {
    useChatStore.getState().resetAll();
    useChatStore.getState().selectSession('websocket:c1', [
      {
        key: 'websocket:c1',
        channel: 'websocket',
        chatId: 'c1',
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
        title: '',
        preview: '',
      },
    ]);
  });

  it('activates the composer when the server reports a running turn', () => {
    useChatStore.getState().applyRunStatus('c1', 12345);

    expect(useChatStore.getState().turnActive).toBe(true);
    expect(useChatStore.getState().runStartedAt).toBe(12345);
  });

  it('reenables the composer when the server reports an idle turn', () => {
    useChatStore.getState().setTurnActive(true);
    useChatStore.getState().setRunStartedAt(12345);

    useChatStore.getState().applyRunStatus('c1', null);

    expect(useChatStore.getState().turnActive).toBe(false);
    expect(useChatStore.getState().runStartedAt).toBeNull();
  });

  it('does not change the active turn for another chat', () => {
    useChatStore.getState().setTurnActive(true);
    useChatStore.getState().setRunStartedAt(12345);

    useChatStore.getState().applyRunStatus('c2', null);

    expect(useChatStore.getState().turnActive).toBe(true);
    expect(useChatStore.getState().runStartedAt).toBe(12345);
  });
});
