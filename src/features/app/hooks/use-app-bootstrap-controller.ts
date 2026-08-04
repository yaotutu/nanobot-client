import { useAuthBootstrapLifecycle } from '@/features/app/hooks/use-auth-bootstrap-lifecycle';
import { selectAuthPhase, selectBootstrap, useAuthStore } from '@/features/auth/store';

/**
 * 启动壳只订阅鉴权阶段所需的最小状态。
 * 聊天、侧边栏、能力目录和 WebSocket 等重依赖留在 ReadyAppShell 的动态模块中，
 * 从而让登录页、不可达提示和连接中状态更早可见。
 */
export function useAppBootstrapController() {
  useAuthBootstrapLifecycle();

  return {
    phase: useAuthStore(selectAuthPhase),
    bootstrap: useAuthStore(selectBootstrap),
    authenticationFailed: useAuthStore((state) => state.authenticationFailed),
    error: useAuthStore((state) => state.error),
    authenticate: useAuthStore((state) => state.authenticate),
    retryConnection: useAuthStore((state) => state.retryConnection),
  };
}

export type AppBootstrapController = ReturnType<typeof useAppBootstrapController>;
