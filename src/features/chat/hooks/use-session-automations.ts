import { useCallback, useEffect, useRef, useState } from 'react';

import type { SessionAutomationJob } from '@/types/api/automations';

interface UseSessionAutomationsOptions {
  loadJobs: (sessionKey: string) => Promise<SessionAutomationJob[]>;
  sessionKey: string | null;
  visible: boolean;
}

/**
 * 定时任务只在面板切到对应 Tab 且拥有会话 key 时读取。
 * 这里刻意不做 3 秒轮询；用户点击刷新才发起新请求，避免后台流量。
 */
export function useSessionAutomations({
  loadJobs,
  sessionKey,
  visible,
}: UseSessionAutomationsOptions) {
  const [jobs, setJobs] = useState<SessionAutomationJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const requestGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!sessionKey) return;
    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    setLoading(true);
    try {
      const nextJobs = await loadJobs(sessionKey);
      if (requestGenerationRef.current !== generation) return;
      setJobs(nextJobs);
      setLoadFailed(false);
    } catch {
      if (requestGenerationRef.current !== generation) return;
      setLoadFailed(true);
    } finally {
      if (requestGenerationRef.current === generation) setLoading(false);
    }
  }, [loadJobs, sessionKey]);

  // 组件卸载后让仍在途的请求失效，避免异步回调继续更新状态。
  useEffect(() => () => {
    requestGenerationRef.current += 1;
  }, []);

  useEffect(() => {
    if (!visible || !sessionKey) return;
    // 初始化放到任务队列中执行，避免 effect 主体同步级联更新状态。
    const frame = setTimeout(() => {
      setJobs([]);
      setLoadFailed(false);
      void refresh();
    }, 0);
    return () => clearTimeout(frame);
  }, [refresh, sessionKey, visible]);
  return { jobs, loading, loadFailed, refresh };
}
