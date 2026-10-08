import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppBootstrapController } from '@/features/app/hooks/use-app-bootstrap-controller';
import { useAppPreferences } from '@/features/app/hooks/use-app-preferences';
import { useUpdateLifecycle } from '@/features/updates';
import { AuthScreen } from '@/features/auth/screen';
import { createDeferredComponent } from '@/hooks/use-deferred-component';
import { markStartup, measureStartup } from '@/services/runtime/startup-performance';

type ReadyAppShellProps = Record<string, never>;

/**
 * 完整工作区只在鉴权成功后挂载。这里刻意不用 React.lazy/Suspense：Pixel XL（Android 10）
 * 在 Fabric 提交 Suspense 懒加载树时曾进入原生 SIGSEGV。
 * 普通 effect/state 包装器既能拆分启动依赖，又避免重新引入该原生崩溃路径。
 */
const DeferredReadyAppShell = createDeferredComponent<ReadyAppShellProps>(() => {
  markStartup('ready_import_start');
  return import('./ReadyAppShell').then(({ ReadyAppShell }) => {
    markStartup('ready_import_end');
    measureStartup('ready_import', 'ready_import_start', 'ready_import_end');
    return ReadyAppShell;
  });
});

export function AppShell() {
  useUpdateLifecycle();
  const auth = useAppBootstrapController();
  const { changeServerUrl, preferences } = useAppPreferences();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    markStartup('app_shell_mounted');
  }, []);

  useEffect(() => {
    if (auth.phase !== 'booting') return;

    // 给鉴权状态 200ms 的快速决策窗口：无凭证用户可直接进入登录页；返回用户则并行预热工作区。
    const timer = setTimeout(() => {
      void DeferredReadyAppShell.preload().catch(() => {
        // 预加载失败不应形成未处理 Promise；真正进入 Ready 时包装器会自动重试并交由 ErrorBoundary。
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [auth.phase]);

  // 登录和网关不可达共用同一个表单；不可达时用户可以直接修改服务器地址再重试。
  if (auth.phase === 'authentication' || auth.phase === 'unreachable') {
    return (
      <AuthScreen
        error={auth.phase === 'unreachable' ? auth.error : null}
        failed={auth.authenticationFailed}
        onServerUrlChange={changeServerUrl}
        onSubmit={auth.authenticate}
        serverUrl={preferences.serverUrl}
      />
    );
  }

  if (auth.phase === 'booting' || !auth.bootstrap) {
    return <AppLoadingState bottomInset={insets.bottom} topInset={insets.top} />;
  }

  return (
    <DeferredReadyAppShell
      componentProps={{}}
      enabled
      fallback={<AppLoadingState bottomInset={insets.bottom} topInset={insets.top} />}
    />
  );
}

function AppLoadingState({ bottomInset, topInset }: { bottomInset: number; topInset: number }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.centered, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <ActivityIndicator color="#6F6E69" />
      <Text style={styles.loadingText}>{t('app.loading.connecting')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF9',
    paddingHorizontal: 28,
    gap: 12,
  },
  loadingText: { color: '#777672', fontSize: 13 },
});
