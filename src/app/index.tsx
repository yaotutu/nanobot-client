import * as SplashScreen from 'expo-splash-screen';
import { type ComponentType, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { markStartup, measureStartup } from '@/services/runtime/startup-performance';

markStartup('home_module');

/**
 * AppShell 会继续向下加载鉴权壳。这里使用进程级 Promise，让首页的轻量 fallback 先提交，
 * 再异步执行应用模块；Fast Refresh 或路由重挂载时也能复用同一次加载。
 */
let appShellPromise: Promise<ComponentType> | null = null;
let splashHidden = false;

function loadAppShell(): Promise<ComponentType> {
  if (!appShellPromise) {
    markStartup('app_shell_import_start');
    appShellPromise = import('@/features/app').then(({ AppShell }) => {
      markStartup('app_shell_import_end');
      measureStartup('app_shell_import', 'app_shell_import_start', 'app_shell_import_end');
      return AppShell;
    });
  }
  return appShellPromise;
}

export default function HomeScreen() {
  const [AppShell, setAppShell] = useState<ComponentType | null>(null);

  const handleFirstLayout = useCallback(() => {
    if (splashHidden) return;
    splashHidden = true;
    markStartup('home_first_layout');
    measureStartup('layout_to_first_frame', 'layout_module', 'home_first_layout');
    void SplashScreen.hideAsync().catch(() => {
      // Splash 已被系统或 Fast Refresh 隐藏时可安全忽略，不影响后续业务模块加载。
    });
  }, []);

  useEffect(() => {
    markStartup('home_mounted');
    let cancelled = false;
    let frameId: number | null = requestAnimationFrame(() => {
      frameId = null;
      void loadAppShell().then((LoadedAppShell) => {
        if (!cancelled) setAppShell(() => LoadedAppShell);
      });
    });

    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, []);

  if (!AppShell) {
    return (
      <View accessibilityRole="progressbar" onLayout={handleFirstLayout} style={styles.loading}>
        <ActivityIndicator color="#6F6E69" size="large" />
      </View>
    );
  }

  return (
    <View onLayout={handleFirstLayout} style={styles.content}>
      <AppShell />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, backgroundColor: '#FAFAF9' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF9',
  },
});
