import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  selectAuthPhase,
  selectAuthSessionEpoch,
  selectBootstrap,
  selectTokenGeneration,
  useAuthStore,
} from '@/features/auth/store';
import { useCapabilitiesStore } from '@/features/capabilities/store';
import { useConnectionStore } from '@/features/connection/store';
import { useSidebarStore } from '@/features/sidebar/store';
import { useSkillsStore } from '@/features/skills/store';
import { useWorkspacesStore } from '@/features/workspaces/store';
import { markStartup } from '@/services/runtime/startup-performance';

const REFRESH_RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const;

type IdleCallback = () => void;
type IdleRuntime = typeof globalThis & {
  requestIdleCallback?: (callback: IdleCallback, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function refreshDelayMs(expiresInSeconds: number): number {
  return Math.max(30_000, expiresInSeconds * 1_000 - 60_000);
}

/**
 * 在首屏提交后的下一帧运行用户最容易立即看到的会话刷新。
 * requestAnimationFrame 在测试或非常早的 RN 初始化阶段不可用时，退回零延迟 timer。
 */
function scheduleAfterFirstFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const frame = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(frame);
  }
  const timer = setTimeout(callback, 0);
  return () => clearTimeout(timer);
}

/**
 * 能力、技能和工作区目录不影响聊天骨架首帧，放到空闲时段执行。
 * 老设备若没有 requestIdleCallback，则最多等待 250ms，兼顾首帧流畅度和功能可用速度。
 */
function scheduleWhenIdle(callback: () => void): () => void {
  const runtime = globalThis as IdleRuntime;
  if (typeof runtime.requestIdleCallback === 'function') {
    const handle = runtime.requestIdleCallback(callback, { timeout: 1_000 });
    return () => runtime.cancelIdleCallback?.(handle);
  }
  const timer = setTimeout(callback, 250);
  return () => clearTimeout(timer);
}

/**
 * 鉴权成功后才启用的数据生命周期：
 * 1. 下一帧刷新会话与侧边栏状态；
 * 2. 空闲时刷新非首屏目录；
 * 3. 在前台且网络可用时按过期时间续期令牌。
 */
export function useReadyDataLifecycle(): void {
  const phase = useAuthStore(selectAuthPhase);
  const bootstrap = useAuthStore(selectBootstrap);
  const sessionEpoch = useAuthStore(selectAuthSessionEpoch);
  const tokenGeneration = useAuthStore(selectTokenGeneration);
  const refreshAuth = useAuthStore((state) => state.refreshBootstrap);
  const bootstrapExpiresIn = bootstrap?.expires_in;
  const networkAvailable = useConnectionStore((state) => state.networkAvailable);
  const refreshSessions = useSidebarStore((state) => state.refresh);
  const refreshSidebarState = useSidebarStore((state) => state.refreshSidebarState);
  const refreshCapabilities = useCapabilitiesStore((state) => state.refreshAll);
  const refreshSkills = useSkillsStore((state) => state.refresh);
  const refreshWorkspaces = useWorkspacesStore((state) => state.refresh);

  useEffect(() => {
    if (phase !== 'ready' || sessionEpoch <= 0) return;

    const cancelFrameTask = scheduleAfterFirstFrame(() => {
      markStartup('ready_primary_refresh_start');
      void Promise.allSettled([refreshSessions(), refreshSidebarState()]).then(() => {
        markStartup('ready_primary_refresh_end');
      });
    });
    const cancelIdleTask = scheduleWhenIdle(() => {
      markStartup('ready_catalog_refresh_start');
      void Promise.allSettled([
        refreshCapabilities(),
        refreshSkills(),
        refreshWorkspaces(),
      ]).then(() => {
        markStartup('ready_catalog_refresh_end');
      });
    });

    return () => {
      cancelFrameTask();
      cancelIdleTask();
    };
  }, [
    phase,
    refreshCapabilities,
    refreshSessions,
    refreshSkills,
    refreshSidebarState,
    refreshWorkspaces,
    sessionEpoch,
  ]);

  useEffect(() => {
    if (!bootstrapExpiresIn || phase !== 'ready') return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    const refreshDueAt = Date.now() + refreshDelayMs(bootstrapExpiresIn);

    const clearTimer = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void runRefresh();
      }, delayMs);
    };

    const runRefresh = async () => {
      if (disposed) return;
      if (!useConnectionStore.getState().networkAvailable || AppState.currentState !== 'active') {
        schedule(5_000);
        return;
      }
      try {
        await refreshAuth('scheduled-renewal');
      } catch {
        if (disposed) return;
        const retryDelay = REFRESH_RETRY_DELAYS_MS[
          Math.min(retryAttempt, REFRESH_RETRY_DELAYS_MS.length - 1)
        ];
        retryAttempt += 1;
        schedule(retryDelay);
      }
    };

    if (networkAvailable) schedule(Math.max(0, refreshDueAt - Date.now()));

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || disposed || Date.now() < refreshDueAt) return;
      void runRefresh();
    });

    return () => {
      disposed = true;
      clearTimer();
      appStateSubscription.remove();
    };
  }, [bootstrapExpiresIn, networkAvailable, phase, refreshAuth, tokenGeneration]);
}
