import { useEffect, useRef } from 'react';

import type { ChatSummary } from '@/types/api/sidebar';

/**
 * 默认会话恢复规则：
 * 1. 首次会话列表成功加载后自动打开默认会话；
 * 2. 服务端列表证明默认会话已删除时清空本地配置；
 * 3. 当前非空会话在服务端消失时回到默认会话；
 * 4. 用户主动新建会话会得到 activeKey = null，不会被这个规则抢回。
 */
export function useDefaultSessionStartup({
  activeKey,
  clearDefaultSession,
  defaultSessionKey,
  enabled,
  error,
  loading,
  selectSession,
  sessions,
}: {
  activeKey: string | null;
  clearDefaultSession: () => void;
  defaultSessionKey: string | null;
  enabled: boolean;
  error: string | null;
  loading: boolean;
  selectSession: (key: string) => void;
  sessions: ChatSummary[];
}) {
  const sawLoadingRef = useRef(false);
  const settledRef = useRef(false);
  // 同一次提交里两个 effect 都可能观察到“默认会话不存在”，用 key 去重清理动作。
  const clearedDefaultSessionKeyRef = useRef<string | null>(null);

  // 只基于首次“加载中 -> 成功完成”的完整事件恢复，网络失败不清空用户配置。
  useEffect(() => {
    if (!enabled || settledRef.current) return;
    if (loading) {
      sawLoadingRef.current = true;
      return;
    }
    // ReadyAppShell 总在生命周期刷新会话前挂载；这里的非空列表兜底用于测试或局部重挂载场景。
    if (!sawLoadingRef.current && sessions.length === 0) return;
    sawLoadingRef.current = true;
    if (error) return;

    settledRef.current = true;
    if (!defaultSessionKey) return;
    if (!sessions.some((session) => session.key === defaultSessionKey)) {
      clearDefaultSession();
      clearedDefaultSessionKeyRef.current = defaultSessionKey;
      return;
    }
    selectSession(defaultSessionKey);
  }, [clearDefaultSession, defaultSessionKey, enabled, error, loading, selectSession, sessions]);

  // 后续刷新时若当前 key 已被服务端删除，则回到仍存在的默认会话。
  useEffect(() => {
    if (!enabled || !settledRef.current || !defaultSessionKey) return;
    if (!sessions.some((session) => session.key === defaultSessionKey)) {
      if (clearedDefaultSessionKeyRef.current !== defaultSessionKey) {
        clearDefaultSession();
        clearedDefaultSessionKeyRef.current = defaultSessionKey;
      }
      return;
    }
    const currentStillExists = !activeKey || sessions.some((session) => session.key === activeKey);
    if (!currentStillExists && activeKey !== defaultSessionKey) {
      selectSession(defaultSessionKey);
    }
  }, [activeKey, clearDefaultSession, defaultSessionKey, enabled, selectSession, sessions]);
}
