import {
  BootstrapAuthRequiredError,
  BootstrapResponseError,
  fetchBootstrap as fetchBootstrapRaw,
  type BootstrapResponse,
  type FetchBootstrapOptions,
} from '@/services/api/bootstrap';
import { getServerUrl } from '@/services/api/config';

/**
 * fetchBootstrap 的薄包装：在 features 层只暴露领域 API，services 保留底层实现。
 * baseUrl 从当前运行时配置派生，登录页或设置页切换后无需重启。
 */
export async function fetchBootstrap(
  secret: string,
  options?: FetchBootstrapOptions,
): Promise<BootstrapResponse> {
  return fetchBootstrapRaw(getServerUrl(), secret, options);
}

export { BootstrapAuthRequiredError, BootstrapResponseError };
