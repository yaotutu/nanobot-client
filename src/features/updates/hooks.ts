import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useStore } from 'zustand';
import { CHECK_INTERVAL } from './model';
import { updateStore } from './runtime';

export const useUpdates = () => useStore(updateStore);

/** 生命周期挂在应用壳，不依赖登录/网关；仅前台检查，杀进程后不声称还能后台监测。 */
export function useUpdateLifecycle() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const enterForeground = () => {
      void updateStore.getState().check();
      if (!timer) timer = setInterval(() => { void updateStore.getState().check(); }, CHECK_INTERVAL);
    };
    const leaveForeground = () => { if (timer) clearInterval(timer); timer = null; };
    if (AppState.currentState === 'active') enterForeground();
    const subscription = AppState.addEventListener('change', state => state === 'active' ? enterForeground() : leaveForeground());
    return () => { leaveForeground(); subscription.remove(); };
  }, []);
}
