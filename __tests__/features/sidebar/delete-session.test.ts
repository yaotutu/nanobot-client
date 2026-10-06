import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteSession, updateSidebarState } from '@/features/sidebar/api';
import { useSidebarStore } from '@/features/sidebar/store';
import type { ChatSummary } from '@/types/api/sidebar';

vi.mock('@/features/sidebar/api', () => ({
  deleteSession: vi.fn(), updateSidebarState: vi.fn(), listSessions: vi.fn(), fetchSidebarState: vi.fn(),
}));

const session: ChatSummary = {
  key: 'websocket:one', channel: 'websocket', chatId: 'one',
  createdAt: null, updatedAt: null, title: '会话', preview: '',
};

describe('删除会话的服务端保护', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSidebarStore.getState().resetAll();
    useSidebarStore.getState().setSessions([session]);
    vi.mocked(updateSidebarState).mockImplementation(async (state) => state);
  });

  it('关联自动任务被拦截时保留会话，向 UI 返回原始拦截标记', async () => {
    const blocked = { deleted: false, blocked_by_automations: true };
    vi.mocked(deleteSession).mockResolvedValue(blocked);
    expect(await useSidebarStore.getState().removeSession(session.key)).toEqual(blocked);
    expect(deleteSession).toHaveBeenCalledExactlyOnceWith(session.key);
    expect(useSidebarStore.getState().sessions).toEqual([session]);
    expect(updateSidebarState).not.toHaveBeenCalled();
  });

  it('成功删除才移除列表条目和本地侧边栏元数据', async () => {
    vi.mocked(deleteSession).mockResolvedValue({ deleted: true });
    expect(await useSidebarStore.getState().removeSession(session.key)).toEqual({ deleted: true });
    expect(useSidebarStore.getState().sessions).toEqual([]);
    expect(updateSidebarState).toHaveBeenCalledTimes(1);
  });

  it('网络错误向 UI 传递，不伪装成成功或静默失败', async () => {
    vi.mocked(deleteSession).mockRejectedValue(new Error('offline'));
    await expect(useSidebarStore.getState().removeSession(session.key)).rejects.toThrow('offline');
    expect(useSidebarStore.getState().sessions).toEqual([session]);
  });
});
