import { act, renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { useChatCommands } from '@/features/chat/hooks/use-chat-commands';
import type { NanobotSocket } from '@/features/connection';
import type { BootstrapResponse } from '@/types/api/runtime';

const mockSetError = jest.fn();
const mockChatStore = { setError: mockSetError, setTurnActive: jest.fn(), prepareUserTurn: jest.fn() };
jest.mock('@/features/chat/store', () => ({
  useChatStore: { getState: () => mockChatStore, setState: jest.fn() },
}));
jest.mock('@/features/connection', () => ({
  isSocketDeliveryUnknownError: () => false,
  useConnectionStore: { getState: () => ({ setReconnectReason: jest.fn() }) },
}));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

const mockNewChat = jest.fn(async () => 'new-chat');
const mockSystemCommand = jest.fn(async () => undefined);
const mockSendMessage = jest.fn(() => ({ turnId: 'turn-one', accepted: Promise.resolve() }));
const mockOnChatCreated = jest.fn();
const socket = {
  newChat: mockNewChat, sendSystemCommand: mockSystemCommand, sendMessage: mockSendMessage,
} as unknown as NanobotSocket;

function useCommands(activeKey: string | null = null) {
  return useChatCommands({
    activeKey, activeWorkspaceScope: null,
    bootstrap: { api_token: 'token' } as BootstrapResponse,
    onChatCreated: mockOnChatCreated, socketRef: { current: socket },
  });
}

describe('聊天模型选择与消息发送', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSystemCommand.mockResolvedValue(undefined);
  });

  it('首条消息在创建会话并确认所选模型后发送，沿用原有系统命令协议', async () => {
    const { result } = await renderHook(() => useCommands());
    await act(async () => result.current.sendMessage('你好', [], { modelPreset: 'fast' }));
    expect(mockOnChatCreated).toHaveBeenCalledWith('new-chat', null);
    expect(mockSystemCommand).toHaveBeenCalledWith('new-chat', '/model fast');
    expect(mockNewChat.mock.invocationCallOrder[0]).toBeLessThan(mockSystemCommand.mock.invocationCallOrder[0]);
    expect(mockSystemCommand.mock.invocationCallOrder[0]).toBeLessThan(mockSendMessage.mock.invocationCallOrder[0]);
    expect(mockSendMessage).toHaveBeenCalledWith('new-chat', '你好', undefined, {
      cliApps: undefined, mcpPresets: undefined, workspaceScope: null, startsNewRun: true,
    });
  });

  it('已有会话发送消息时不重复创建会话或切换模型', async () => {
    const { result } = await renderHook(() => useCommands('websocket:existing'));
    await act(async () => result.current.sendMessage('你好', [], { modelPreset: 'fast' }));
    expect(mockNewChat).not.toHaveBeenCalled();
    expect(mockSystemCommand).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('切换模型失败时不发送首条消息，并将错误返回给草稿恢复逻辑', async () => {
    mockSystemCommand.mockRejectedValue(new Error('model unavailable'));
    const { result } = await renderHook(() => useCommands());
    await act(async () => {
      await expect(result.current.sendMessage('你好', [], { modelPreset: 'fast' })).rejects.toThrow('model unavailable');
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSetError).toHaveBeenCalledWith('model unavailable');
  });
});
