import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DebugOverlay } from '@/components/overlays/debug-overlay';
import { RootErrorBoundary } from '@/components/overlays/error-boundary';
import { ensureI18n } from '@/i18n';
import { debugLog } from '@/services/runtime/debug-log';
import { markStartup, measureStartup } from '@/services/runtime/startup-performance';
import { useLocalPreferencesStore } from '@/stores/local-preferences-store';

// 在模块初始化阶段立即阻止自动隐藏；真正隐藏由首页首个轻量 View 的 onLayout 负责。
void SplashScreen.preventAutoHideAsync();
markStartup('layout_module');

// 捕获未处理 JS 错误并写入可视 DebugOverlay；release 构建不能依赖会被剥离的 console.*。
if (typeof globalThis !== 'undefined') {
  const handler = (globalThis as unknown as { ErrorUtils?: { setGlobalHandler?: (fn: (err: unknown, isFatal?: boolean) => void) => void } }).ErrorUtils;
  if (handler?.setGlobalHandler) {
    handler.setGlobalHandler((err: unknown, isFatal?: boolean) => {
      const error = err as { name?: string; message?: string } | undefined;
      debugLog('GLOBAL_ERROR', `${isFatal ? 'FATAL' : 'non-fatal'} ${error?.name}: ${error?.message}`);
    });
  }
}

function LocalizationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const settledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const markReady = () => {
      if (cancelled || settledRef.current) return;
      settledRef.current = true;
      setReady(true);
      markStartup('localization_ready');
      measureStartup('localization_total', 'preferences_start', 'localization_ready');
    };
    const fallbackTimer = setTimeout(() => {
      if (cancelled || settledRef.current) return;
      debugLog('GATE', 'startup timeout; continue with fallback state');
      setTimedOut(true);
      markReady();
    }, 2500);

    const initialize = async () => {
      try {
        // 先读取持久化偏好，随后只加载用户实际选择的语言，避免启动时解析全部语言包。
        markStartup('preferences_start');
        await useLocalPreferencesStore.getState().hydrate();
        markStartup('preferences_end');

        const { language } = useLocalPreferencesStore.getState().preferences;
        markStartup('i18n_start');
        await ensureI18n(language);
        markStartup('i18n_end');
        measureStartup('preferences_hydrate', 'preferences_start', 'preferences_end');
        measureStartup('i18n_initialize', 'i18n_start', 'i18n_end');
      } catch (error) {
        debugLog('GATE', `startup error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        markReady();
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
    };
  }, []);

  if (!ready) {
    return (
      <View style={bootStyles.root}>
        <ActivityIndicator color="#6F6E69" size="large" />
        <Text style={bootStyles.text}>{timedOut ? 'Starting...' : 'Loading...'}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    markStartup('root_layout_mounted');
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <RootErrorBoundary>
          <LocalizationGate>
            <Stack screenOptions={{ headerShown: false }} />
          </LocalizationGate>
        </RootErrorBoundary>
        <DebugOverlay />
      </View>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF9' },
});

const bootStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF9',
    gap: 12,
  },
  text: { color: '#777672', fontSize: 13 },
});
