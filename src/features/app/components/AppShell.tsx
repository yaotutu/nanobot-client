import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppBootstrapController } from '@/features/app/hooks/use-app-bootstrap-controller';
import { AuthScreen } from '@/features/auth/screen';
import { createDeferredComponent } from '@/hooks/use-deferred-component';
import { markStartup, measureStartup } from '@/services/runtime/startup-performance';

type ReadyAppShellProps = Record<string, never>;

/**
 * 完整工作区只在鉴权成功后挂载。这里刻意不用 React.lazy/Suspense：Pixel XL（Android 10）
 * 在 Fabric 提交 Suspense 懒加载树时曾进入 MountingCoordinator 原生 SIGSEGV。
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
  const auth = useAppBootstrapController();
  const { t } = useTranslation();
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

  if (auth.phase === 'authentication') {
    return <AuthScreen failed={auth.authenticationFailed} onSubmit={auth.authenticate} />;
  }

  if (auth.phase === 'unreachable') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.errorTitle}>{t('app.auth.error.title')}</Text>
        <Text style={styles.errorMessage}>{auth.error ?? t('app.auth.error.gatewayHint')}</Text>
        <Pressable onPress={auth.retryConnection} style={styles.retryButton}>
          <Text style={styles.retryText}>{t('settings.channels.reconnect')}</Text>
        </Pressable>
      </View>
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
  errorTitle: { color: '#252421', fontSize: 20, fontWeight: '600' },
  errorMessage: { color: '#777672', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retryButton: { marginTop: 8, minWidth: 128, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#242320' },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
