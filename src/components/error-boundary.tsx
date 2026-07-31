import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DebugOverlay } from './debug-overlay';
import { debugLog } from '@/lib/debug-log';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Diagnostic boundary. Release builds strip console.* and show a black screen
 * with no logcat output. This boundary catches render errors, stores them in
 * the on-screen debug log, and renders a HIGH-VISIBILITY fallback so we can
 * see exactly what is failing.
 */
export class RootErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    debugLog('ERROR_BOUNDARY', `${error.name}: ${error.message}`);
    if (error.stack) {
      // Log first few lines of stack
      const stackLines = error.stack.split('\n').slice(0, 5).join(' | ');
      debugLog('ERROR_BOUNDARY', stackLines);
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <View style={styles.root}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>RENDER ERROR</Text>
            <Text style={styles.message}>{err?.name}: {err?.message}</Text>
            <Text style={styles.stack}>{err?.stack ?? '(no stack)'}</Text>
          </ScrollView>
          <DebugOverlay />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFE000' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  title: { color: '#CC0000', fontSize: 22, fontWeight: '800', marginBottom: 12 },
  message: { color: '#333300', fontSize: 15, marginBottom: 16, lineHeight: 22, fontWeight: '600' },
  stack: { color: '#666600', fontSize: 11, fontFamily: 'monospace', lineHeight: 16 },
});
