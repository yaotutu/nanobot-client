import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchThread } from '@/features/chat/api';
import { apiClient, ApiError } from '@/services/api/api';

const request = vi.spyOn(apiClient, 'request');

describe('当前聊天历史协议边界', () => {
  beforeEach(() => { request.mockReset(); });

  it('只接收 schema 3 的事件快照，并保留分页和取消参数', async () => {
    const signal = new AbortController().signal;
    request.mockResolvedValue({
      schemaVersion: 3, projection: 'events', events: [{
        event: 'user_message', chat_id: 'c1', projection_id: 'u1', text: '你好', created_at_ms: 100,
      }],
      active_turn_id: null, has_pending_tool_calls: false,
    });
    const result = await fetchThread('websocket:c1', { limit: 20, direction: 'latest', before: 'cursor', signal });
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/sessions/websocket%3Ac1/webui-thread', {
      method: 'GET', query: { limit: 20, direction: 'latest', before: 'cursor' }, signal,
    });
    expect(result?.messages).toEqual([expect.objectContaining({ id: 'user-u1', content: '你好', createdAt: 100 })]);
  });

  it.each([
    { schemaVersion: 2, messages: [] },
    { schemaVersion: 3, projection: 'messages', messages: [] },
    { schemaVersion: 3, projection: 'events', events: null },
  ])('拒绝旧消息快照或缺失的事件数组，不提供历史兼容分支：%j', async (payload) => {
    request.mockResolvedValue(payload);
    await expect(fetchThread('websocket:c1')).rejects.toThrow();
  });

  it('不存在的会话仍返回空结果，其他服务端错误继续上抛', async () => {
    request.mockRejectedValueOnce(new ApiError(404, 'Not found'));
    await expect(fetchThread('websocket:c1')).resolves.toBeNull();
    const failure = new ApiError(500, 'Server error');
    request.mockRejectedValueOnce(failure);
    await expect(fetchThread('websocket:c1')).rejects.toBe(failure);
  });
});
