import {
  BootstrapAuthRequiredError,
  fetchBootstrap as fetchBootstrapRaw,
  type BootstrapResponse,
} from '@/services/bootstrap';
import { DEFAULT_SERVER_URL } from '@/services/config';

/**
 * fetchBootstrap 的薄包装：在 features 层只暴露领域 API，services 保留底层实现。
 * baseUrl 从 services/config 派生。
 */
export async function fetchBootstrap(secret: string): Promise<BootstrapResponse> {
  return fetchBootstrapRaw(DEFAULT_SERVER_URL, secret);
}

export { BootstrapAuthRequiredError };
