import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootErrorBoundary } from '@/components/error-boundary';
import { DebugOverlay } from '@/components/debug-overlay';
import { debugLog } from '@/services/debug-log';
import { ensureI18n, setAppLanguage } from '@/i18n';
import { readLocalPreferences } from '@/stores/local-preferences-store';

// Prevent auto-hide so we can explicitly hide once the first screen renders.
void SplashScreen.preventAutoHideAsync();
debugLog('LAYOUT', 'module eval + preventAutoHideAsync');

// Catch any uncaught JS errors globally so they appear in the on-screen
// debug overlay (console.* is stripped in release builds).
if (typeof globalThis !== 'undefined') {
  const handler = (globalThis as unknown as { ErrorUtils?: { setGlobalHandler?: (fn: (err: unknown, isFatal?: boolean) => void) => void } }).ErrorUtils;
  if (handler?.setGlobalHandler) {
    handler.setGlobalHandler((err: unknown, isFatal?: boolean) => {
      const e = err as { name?: string; message?: string; stack?: string } | undefined;
      debugLog('GLOBAL_ERROR', `${isFatal ? 'FATAL' : 'non-fatal'} ${e?.name}: ${e?.message}`);
    });
  }
}

function LocalizationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    debugLog('GATE', 'effect start');
    let cancelled = false;
    const fallbackTimer = setTimeout(() => {
      if (!cancelled && !ready) {
        debugLog('GATE', 'FALLBACK timeout -> ready');
        setTimedOut(true);
        setReady(true);
      }
    }, 2500);

    void ensureI18n()
      .then(() => readLocalPreferences())
      .then((preferences) => {
        if (cancelled) return;
        debugLog('GATE', `prefs read lang=${preferences.language}`);
        return setAppLanguage(preferences.language as never);
      })
      .then(() => {
        debugLog('GATE', 'lang set');
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        debugLog('GATE', `error ${message}`);
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
          debugLog('GATE', 'ready=true');
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) {
      debugLog('GATE', 'hiding splash screen');
      void SplashScreen.hideAsync().catch(() => {
        debugLog('GATE', 'splash hide failed');
      });
    }
  }, [ready]);

  if (!ready) {
    return (
      <View style={bootStyles.root}>
        <ActivityIndicator color="#6F6E69" size="large" />
        <Text style={bootStyles.text}>{timedOut ? 'Starting...' : 'Loading...'}</Text>
        <DebugOverlay />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  debugLog('LAYOUT', 'RootLayout render');
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
