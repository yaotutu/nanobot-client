import { DEFAULT_SERVER_URL } from './config';
import { createApiClient, type ApiClient } from './api-client';
import { useAuthStore } from '@/features/auth/store';

/**
 * 全局 API 客户端单例。baseUrl 在创建时锁定；token 通过闭包从 auth store 动态读取。
 *
 * 使用方式：
 *   import { apiClient } from '@/services/api/api';
 *   const list = await apiClient.get<{ sessions: Session[] }>('/api/sessions');
 *
 * 切勿在模块顶层使用 `useAuthStore.getState()` 之外的方式获取 token —— 会破坏
 * SSR / 测试环境下的可注入性。
 */
function createDefaultApiClient(): ApiClient {
  return createApiClient({
    baseUrl: DEFAULT_SERVER_URL,
    getToken: () => useAuthStore.getState().apiToken ?? '',
  });
}

export const apiClient: ApiClient = createDefaultApiClient();

/** 测试 / 自定义 host 时可覆盖单例。 */
export function setApiClient(client: ApiClient): void {
  Object.assign(apiClient, client);
}

export { ApiError, createApiClient } from './api-client';
export type { ApiClient, RequestOptions } from './api-client';
