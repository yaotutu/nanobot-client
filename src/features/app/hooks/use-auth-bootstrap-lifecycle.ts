import { useEffect } from 'react';

import { useAuthStore } from '@/features/auth/state';
import {
  selectPreferencesHydrated,
  useLocalPreferencesStore,
} from '@/stores/local-preferences-store';
import { markStartup, measureStartup } from '@/services/runtime/startup-performance';

/**
 * 启动阶段只负责从安全存储恢复鉴权信息。
 * 目录刷新、令牌续期等 Ready 阶段任务位于 useReadyDataLifecycle，避免它们进入轻量启动壳依赖图。
 */
export function useAuthBootstrapLifecycle(): void {
  // 偏好先完成恢复，再决定是否自动登录；首次安装时不能拿默认地址和旧密码直接进入聊天。
  const preferencesHydrated = useLocalPreferencesStore(selectPreferencesHydrated);
  const serverConfigured = useLocalPreferencesStore((state) => state.preferences.serverConfigured);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (!preferencesHydrated) return;
    // 服务器尚未由用户确认时，清理旧密码并停在服务器配置页。密码只在地址确认后出现。
    if (!serverConfigured) {
      void logout();
      return;
    }

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
  }, [logout, preferencesHydrated, serverConfigured]);
}
