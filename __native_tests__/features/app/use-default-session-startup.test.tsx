import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { useDefaultSessionStartup } from '@/features/app/hooks/use-default-session-startup';
import type { ChatSummary } from '@/types/api/sidebar';

type DefaultSessionInput = Parameters<typeof useDefaultSessionStartup>[0];

const createSession = (key: string, title: string): ChatSummary => ({
  key,
  channel: 'websocket',
  chatId: key.replace('websocket:', ''),
  createdAt: '2026-10-09T08:00:00Z',
  updatedAt: '2026-10-09T08:00:00Z',
  title,
  preview: `${title} preview`,
});

const mainSession = createSession('websocket:main', 'Main');
const workSession = createSession('websocket:work', 'Work');

const createInput = (overrides: Partial<DefaultSessionInput> = {}): DefaultSessionInput => ({
  activeKey: null,
  clearDefaultSession: jest.fn(),
  defaultSessionKey: 'websocket:main',
  enabled: true,
  error: null,
  loading: true,
  selectSession: jest.fn(),
  sessions: [],
  ...overrides,
});

/** 使用可变对象驱动 rerender，保持 hook 输入仍是普通对象契约。 */
const renderDefaultSessionHook = async (initial: DefaultSessionInput) => {
  const rendered = await renderHook(() => useDefaultSessionStartup(initial));
  const update = async (overrides: Partial<DefaultSessionInput>) => {
    await act(async () => {
      Object.assign(initial, createInput(overrides));
      rendered.rerender(undefined);
    });
  };
  return { update };
};

describe('useDefaultSessionStartup', () => {
  it('首次会话加载成功后打开默认会话', async () => {
    const input = createInput();
    const { update } = await renderDefaultSessionHook(input);

    await update({ loading: false, sessions: [mainSession, workSession] });

    expect(input.selectSession).toHaveBeenCalledWith('websocket:main');
    expect(input.clearDefaultSession).not.toHaveBeenCalled();
  });

  it('加载失败不清空默认会话，成功后仍可恢复', async () => {
    const input = createInput();
    const { update } = await renderDefaultSessionHook(input);

    await update({ loading: false, error: 'network' });
    expect(input.selectSession).not.toHaveBeenCalled();
    expect(input.clearDefaultSession).not.toHaveBeenCalled();

    await update({ loading: false, sessions: [mainSession] });
    expect(input.selectSession).toHaveBeenCalledWith('websocket:main');
  });

  it('默认会话被服务端删除时清空本地配置', async () => {
    const input = createInput();
    const { update } = await renderDefaultSessionHook(input);

    await update({ loading: false, sessions: [workSession] });

    expect(input.selectSession).not.toHaveBeenCalled();
    expect(input.clearDefaultSession).toHaveBeenCalledTimes(1);
  });

  it('当前会话从服务端列表消失时回到默认会话，但手动新建会话不被抢回', async () => {
    const input = createInput({ defaultSessionKey: null });
    const { update } = await renderDefaultSessionHook(input);

    await update({ defaultSessionKey: null, loading: false, sessions: [mainSession] });
    await update({ defaultSessionKey: 'websocket:main', loading: false, sessions: [mainSession] });
    expect(input.selectSession).not.toHaveBeenCalled();

    await update({
      defaultSessionKey: 'websocket:main',
      activeKey: 'websocket:deleted',
      loading: false,
      sessions: [mainSession],
    });
    expect(input.selectSession).toHaveBeenCalledWith('websocket:main');
  });
});
