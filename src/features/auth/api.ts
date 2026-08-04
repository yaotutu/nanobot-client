import {
  BootstrapAuthRequiredError,
  BootstrapResponseError,
  fetchBootstrap as fetchBootstrapRaw,
  type BootstrapResponse,
  type FetchBootstrapOptions,
} from '@/services/api/bootstrap';
import { DEFAULT_SERVER_URL } from '@/services/api/config';

/**
 * fetchBootstrap 的薄包装：在 features 层只暴露领域 API，services 保留底层实现。
 * baseUrl 从 services/config 派生。
 */
export async function fetchBootstrap(
  secret: string,
  options?: FetchBootstrapOptions,
): Promise<BootstrapResponse> {
  return fetchBootstrapRaw(DEFAULT_SERVER_URL, secret, options);
}

export { BootstrapAuthRequiredError, BootstrapResponseError };
