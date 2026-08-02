import { DEFAULT_SERVER_URL } from './config';
import { createApiClient, type ApiClient } from './api-client';

/**
 * 全局 API 客户端单例。baseUrl 在创建时锁定；token 通过可注入 provider 动态读取。
 *
 * 使用方式：
 *   import { apiClient } from '@/services/api/api';
 *   const list = await apiClient.get<{ sessions: Session[] }>('/api/sessions');
 *
 * token provider 由认证 feature 在模块初始化时注入，保持基础服务与状态层解耦。
 */
let apiTokenProvider: () => string = () => '';

/** Configure the current in-memory API token source without coupling services to a feature store. */
export function setApiTokenProvider(provider: () => string): void {
  apiTokenProvider = provider;
}

function createDefaultApiClient(): ApiClient {
  return createApiClient({
    baseUrl: DEFAULT_SERVER_URL,
    getToken: () => apiTokenProvider(),
  });
}

export const apiClient: ApiClient = createDefaultApiClient();

/** 测试 / 自定义 host 时可覆盖单例。 */
export function setApiClient(client: ApiClient): void {
  Object.assign(apiClient, client);
}

export { ApiError, createApiClient } from './api-client';
export type { ApiClient, RequestOptions } from './api-client';
