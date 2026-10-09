import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteSession,
  fetchSidebarState,
  listSessions,
  updateSidebarState,
} from '@/features/sidebar/api';
import { useSidebarStore } from '@/features/sidebar/store';
import type { SessionDeleteResult } from '@/types/api/chat/thread';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';

vi.mock('@/features/sidebar/api', () => ({
  deleteSession: vi.fn(),
  fetchSidebarState: vi.fn(),
  listSessions: vi.fn(),
  updateSidebarState: vi.fn(),
}));

// 手动控制请求完成时机，稳定复现跨 reset 的旧响应和并发写入，无需真实网络或计时器。
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const makeState = (overrides: Partial<SidebarStatePayload> = {}): SidebarStatePayload => ({
  ...useSidebarStore.getInitialState().sidebarState,
  ...overrides,
});

const session: ChatSummary = {
  key: 'websocket:one',
  channel: 'websocket',
  chatId: 'one',
  createdAt: null,
  updatedAt: null,
  title: '新环境会话',
  preview: '',
};

describe('sidebar 请求的环境隔离与顺序保存', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSidebarStore.getState().resetAll();
    vi.mocked(updateSidebarState).mockImplementation(async (state) => state);
  });

  it.each(['resolve', 'reject'] as const)('reset 后旧 refresh %s 不改变新环境的会话和加载状态', async (outcome) => {
    const oldResponse = deferred<ChatSummary[]>();
    const newResponse = deferred<ChatSummary[]>();
    vi.mocked(listSessions)
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise);
    const oldRefresh = useSidebarStore.getState().refresh();

    useSidebarStore.getState().resetAll();
    useSidebarStore.setState({ sessions: [session], error: '新环境错误' });
    const newRefresh = useSidebarStore.getState().refresh();
    const newState = useSidebarStore.getState();
    if (outcome === 'resolve') oldResponse.resolve([]);
    else oldResponse.reject(new Error('旧环境网络错误'));
    await oldRefresh;

    expect(useSidebarStore.getState()).toBe(newState);
    expect(useSidebarStore.getState().loading).toBe(true);
    newResponse.resolve([session]);
    await newRefresh;
    expect(useSidebarStore.getState().sessions).toEqual([session]);
    expect(useSidebarStore.getState().loading).toBe(false);
  });

  it('并发刷新时只保留最新响应，避免启动请求覆盖打开面板后的最新列表', async () => {
    const oldResponse = deferred<ChatSummary[]>();
    const latestResponse = deferred<ChatSummary[]>();
    vi.mocked(listSessions)
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(latestResponse.promise);
    const oldRefresh = useSidebarStore.getState().refresh();
    const latestRefresh = useSidebarStore.getState().refresh();

    oldResponse.resolve([]);
    await oldRefresh;
    expect(useSidebarStore.getState().loading).toBe(true);

    latestResponse.resolve([session]);
    await latestRefresh;
    expect(useSidebarStore.getState().sessions).toEqual([session]);
    expect(useSidebarStore.getState().loading).toBe(false);
  });

  it('reset 后旧 refreshSidebarState 返回不覆盖新环境状态', async () => {
    const oldResponse = deferred<SidebarStatePayload>();
    vi.mocked(fetchSidebarState).mockReturnValueOnce(oldResponse.promise);
    const refresh = useSidebarStore.getState().refreshSidebarState();

    useSidebarStore.getState().resetAll();
    const newState = makeState({ pinned_keys: ['new'] });
    useSidebarStore.setState({ sidebarState: newState });
    oldResponse.resolve(makeState({ pinned_keys: ['old'] }));
    await refresh;

    expect(useSidebarStore.getState().sidebarState).toBe(newState);
  });

  it('远端 sidebar 广播在空闲时直接生效', () => {
    const remoteState = makeState({ pinned_keys: ['remote'] });
    useSidebarStore.getState().applyRemoteSidebarState(remoteState);

    expect(useSidebarStore.getState().sidebarState).toBe(remoteState);
  });

  it('远端 sidebar 广播不能覆盖本机正在保存的乐观状态', async () => {
    const response = deferred<SidebarStatePayload>();
    vi.mocked(updateSidebarState).mockReturnValueOnce(response.promise);
    const mutation = useSidebarStore.getState().renameSession(session.key, '本机标题');
    await Promise.resolve();

    const optimisticState = useSidebarStore.getState().sidebarState;
    useSidebarStore.getState().applyRemoteSidebarState(makeState({ pinned_keys: ['remote'] }));
    expect(useSidebarStore.getState().sidebarState).toBe(optimisticState);

    const persisted = makeState({ title_overrides: { [session.key]: '服务端标题' } });
    response.resolve(persisted);
    await mutation;
    expect(useSidebarStore.getState().sidebarState).toEqual(persisted);
  });

  it.each(['togglePinned', 'toggleArchived'] as const)(
    'reset 后旧 %s 成功不回写，也不清除新环境同 key 操作的 pending',
    async (action) => {
      const oldResponse = deferred<SidebarStatePayload>();
      const newResponse = deferred<SidebarStatePayload>();
      vi.mocked(updateSidebarState)
        .mockReturnValueOnce(oldResponse.promise)
        .mockReturnValueOnce(newResponse.promise);
      const oldMutation = useSidebarStore.getState()[action](session.key);
      await Promise.resolve();
      expect(updateSidebarState).toHaveBeenCalledTimes(1);

      useSidebarStore.getState().resetAll();
      const newMutation = useSidebarStore.getState()[action](session.key);
      await Promise.resolve();
      const newState = useSidebarStore.getState();
      // 新环境的写请求无需等待旧请求完成，且旧 finally 不能解除它的 pending。
      expect(updateSidebarState).toHaveBeenCalledTimes(2);
      oldResponse.resolve(makeState({ updated_at: 'old' }));
      await oldMutation;
      expect(useSidebarStore.getState()).toBe(newState);
      expect(useSidebarStore.getState().pending.has(session.key)).toBe(true);

      newResponse.resolve(newState.sidebarState);
      await newMutation;
      expect(useSidebarStore.getState().pending.size).toBe(0);
    },
  );

  it('reset 后旧 mutation 失败不写入新环境的 error', async () => {
    const oldResponse = deferred<SidebarStatePayload>();
    vi.mocked(updateSidebarState).mockReturnValueOnce(oldResponse.promise);
    const mutation = useSidebarStore.getState().renameSession(session.key, '旧标题');
    await Promise.resolve();

    useSidebarStore.getState().resetAll();
    await useSidebarStore.getState().renameSession(session.key, '新标题');
    useSidebarStore.setState({ error: '新环境错误' });
    const newState = useSidebarStore.getState();
    oldResponse.reject(new Error('旧环境保存失败'));
    await mutation;

    expect(useSidebarStore.getState()).toBe(newState);
  });

  it('reset 后旧 delete 成功保留新环境同 key 的会话和元数据，不发送清理写请求', async () => {
    const oldResponse = deferred<SessionDeleteResult>();
    vi.mocked(deleteSession).mockReturnValueOnce(oldResponse.promise);
    useSidebarStore.getState().setSessions([session]);
    const removal = useSidebarStore.getState().removeSession(session.key);

    useSidebarStore.getState().resetAll();
    useSidebarStore.setState({
      sessions: [session],
      sidebarState: makeState({
        pinned_keys: [session.key],
        archived_keys: [session.key],
        title_overrides: { [session.key]: '新标题' },
        project_name_overrides: { [session.key]: '新项目' },
        tags_by_key: { [session.key]: ['new'] },
      }),
    });
    const newState = useSidebarStore.getState();
    oldResponse.resolve({ deleted: true });

    await expect(removal).resolves.toEqual({ deleted: true });
    expect(useSidebarStore.getState()).toBe(newState);
    expect(updateSidebarState).not.toHaveBeenCalled();
  });

  it('reset 后旧 delete 失败仍向调用方抛错，但不污染新环境', async () => {
    const oldResponse = deferred<SessionDeleteResult>();
    vi.mocked(deleteSession).mockReturnValueOnce(oldResponse.promise);
    const removal = useSidebarStore.getState().removeSession(session.key);
    const rejection = expect(removal).rejects.toThrow('旧环境删除失败');

    useSidebarStore.getState().resetAll();
    useSidebarStore.setState({ sessions: [session], error: '新环境错误' });
    const newState = useSidebarStore.getState();
    oldResponse.reject(new Error('旧环境删除失败'));
    await rejection;

    expect(useSidebarStore.getState()).toBe(newState);
    expect(updateSidebarState).not.toHaveBeenCalled();
  });

  it('两个置顶立即乐观展示，按操作顺序串行发送且始终保留两项', async () => {
    const firstResponse = deferred<SidebarStatePayload>();
    const secondResponse = deferred<SidebarStatePayload>();
    vi.mocked(updateSidebarState)
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    const firstMutation = useSidebarStore.getState().togglePinned('first');
    const secondMutation = useSidebarStore.getState().togglePinned('second');

    expect(useSidebarStore.getState().sidebarState.pinned_keys).toEqual(['first', 'second']);
    expect(useSidebarStore.getState().pending).toEqual(new Set(['first', 'second']));
    await Promise.resolve();
    expect(updateSidebarState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateSidebarState).mock.calls[0][0].pinned_keys).toEqual(['first']);

    firstResponse.resolve(makeState({ pinned_keys: ['first'] }));
    await firstMutation;
    expect(useSidebarStore.getState().sidebarState.pinned_keys).toEqual(['first', 'second']);
    await vi.waitFor(() => expect(updateSidebarState).toHaveBeenCalledTimes(2));
    const secondSnapshot = vi.mocked(updateSidebarState).mock.calls[1][0];
    expect(secondSnapshot.pinned_keys).toEqual(['first', 'second']);
    expect(useSidebarStore.getState().pending).toEqual(new Set(['second']));

    secondResponse.resolve({ ...secondSnapshot, updated_at: 'persisted' });
    await secondMutation;
    expect(useSidebarStore.getState().sidebarState.pinned_keys).toEqual(['first', 'second']);
    expect(useSidebarStore.getState().sidebarState.updated_at).toBe('persisted');
    expect(useSidebarStore.getState().pending.size).toBe(0);
  });

  it('置顶、归档、重命名、分组和显示设置共用写队列，后续快照保留全部操作', async () => {
    const firstResponse = deferred<SidebarStatePayload>();
    vi.mocked(updateSidebarState).mockReturnValueOnce(firstResponse.promise);
    const actions = useSidebarStore.getState();
    const mutations = [
      actions.togglePinned('first'),
      actions.toggleArchived('second'),
      actions.renameSession('first', ' 新标题 '),
      actions.renameProject('project', ' 新项目 '),
      actions.toggleGroup('group'),
      actions.setShowArchived(true),
    ];
    const optimisticState = useSidebarStore.getState().sidebarState;
    expect(optimisticState).toMatchObject({
      pinned_keys: ['first'],
      archived_keys: ['second'],
      title_overrides: { first: '新标题' },
      project_name_overrides: { project: '新项目' },
      collapsed_groups: { group: true },
      view: { show_archived: true },
    });
    await Promise.resolve();
    expect(updateSidebarState).toHaveBeenCalledTimes(1);
    firstResponse.resolve(vi.mocked(updateSidebarState).mock.calls[0][0]);
    await Promise.all(mutations);

    const snapshots = vi.mocked(updateSidebarState).mock.calls.map(([state]) => state);
    expect(snapshots).toHaveLength(6);
    expect(snapshots[1].archived_keys).toEqual(['second']);
    expect(snapshots[2].title_overrides).toEqual({ first: '新标题' });
    expect(snapshots[3].project_name_overrides).toEqual({ project: '新项目' });
    expect(snapshots[4].collapsed_groups).toEqual({ group: true });
    expect(snapshots[5]).toEqual(optimisticState);
    expect(useSidebarStore.getState().sidebarState).toEqual(optimisticState);
  });

  it.each(['resolve', 'reject'] as const)('reset 后尚未发送的旧写任务失效，旧请求 %s 不阻塞新队列', async (outcome) => {
    const oldResponse = deferred<SidebarStatePayload>();
    vi.mocked(updateSidebarState).mockReturnValueOnce(oldResponse.promise);
    const oldMutation = useSidebarStore.getState().togglePinned('old-first');
    const queuedMutation = useSidebarStore.getState().togglePinned('old-queued');
    await Promise.resolve();
    expect(updateSidebarState).toHaveBeenCalledTimes(1);

    useSidebarStore.getState().resetAll();
    await useSidebarStore.getState().togglePinned('new');
    expect(updateSidebarState).toHaveBeenCalledTimes(2);
    const newState = useSidebarStore.getState();
    if (outcome === 'resolve') oldResponse.resolve(makeState({ pinned_keys: ['old-first'] }));
    else oldResponse.reject(new Error('旧环境保存失败'));
    await Promise.all([oldMutation, queuedMutation]);

    expect(updateSidebarState).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateSidebarState).mock.calls[1][0].pinned_keys).toEqual(['new']);
    expect(useSidebarStore.getState()).toBe(newState);
  });

  it('reset 在首个写任务发出前发生时，该任务也不会发送', async () => {
    const mutation = useSidebarStore.getState().togglePinned('old');
    useSidebarStore.getState().resetAll();
    await mutation;

    expect(updateSidebarState).not.toHaveBeenCalled();
    expect(useSidebarStore.getState().sidebarState.pinned_keys).toEqual([]);
  });

  it('首个写请求失败后队列继续发送，下一份快照保留两次操作', async () => {
    const firstResponse = deferred<SidebarStatePayload>();
    vi.mocked(updateSidebarState).mockReturnValueOnce(firstResponse.promise);
    const firstMutation = useSidebarStore.getState().togglePinned('first');
    const secondMutation = useSidebarStore.getState().togglePinned('second');
    await Promise.resolve();
    expect(updateSidebarState).toHaveBeenCalledTimes(1);
    firstResponse.reject(new Error('保存失败'));
    await Promise.all([firstMutation, secondMutation]);

    expect(updateSidebarState).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateSidebarState).mock.calls[1][0].pinned_keys).toEqual(['first', 'second']);
    expect(useSidebarStore.getState().sidebarState.pinned_keys).toEqual(['first', 'second']);
    expect(useSidebarStore.getState().pending.size).toBe(0);
    expect(useSidebarStore.getState().error).toBe('保存失败');
  });
});
