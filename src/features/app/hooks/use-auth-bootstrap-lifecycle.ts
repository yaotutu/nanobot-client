import { useEffect } from 'react';

import { useAuthStore } from '@/features/auth/store';
import { markStartup, measureStartup } from '@/services/runtime/startup-performance';

/**
 * 启动阶段只负责从安全存储恢复鉴权信息。
 * 目录刷新、令牌续期等 Ready 阶段任务位于 useReadyDataLifecycle，避免它们进入轻量启动壳依赖图。
 */
export function useAuthBootstrapLifecycle(): void {
  useEffect(() => {
    let active = true;
    markStartup('auth_bootstrap_start');
    void useAuthStore.getState().bootstrapFromStorage().finally(() => {
      if (!active) return;
      markStartup('auth_bootstrap_end');
      measureStartup('auth_bootstrap', 'auth_bootstrap_start', 'auth_bootstrap_end');
    });

    return () => {
      active = false;
    };
  }, []);
}
