import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getDebugEntries, getDebugVersion, subscribeDebug, type DebugEntry } from '@/lib/debug-log';

/**
 * Renders the debug log on-screen so we can see boot progress in release
 * builds where console.* calls are stripped by the minifier. Only visible
 * when the __DEBUG_OVERLAY flag is set (toggle via shake or dev menu).
 */

let overlayVisible = false;

export function setDebugOverlayVisible(visible: boolean): void {
  overlayVisible = visible;
}

export function DebugOverlay() {
  const [, forceUpdate] = useState(0);
  const [visible, setVisible] = useState(overlayVisible);

  useEffect(() => {
    return subscribeDebug(() => forceUpdate((n) => n + 1));
  }, []);

  useEffect(() => {
    // On Android, listen for shakes to toggle (simplified: always show in debug)
    if (Platform.OS === 'android') {
      const interval = setInterval(() => {
        setVisible(overlayVisible);
      }, 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, []);

  if (!visible) return null;

  const entries = getDebugEntries();
  if (entries.length === 0) return null;

  return (
    <View pointerEvents="none" style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.header}>DEBUG LOG (v{getDebugVersion()})</Text>
        {entries.map((entry: DebugEntry, index: number) => (
          <Text key={`${entry.ts}-${index}`} style={styles.entry}>
            <Text style={styles.tag}>[{entry.tag}]</Text> {entry.msg}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 30,
    left: 8,
    right: 8,
    maxHeight: 260,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 8,
    zIndex: 99999,
    elevation: 99999,
  },
  scroll: { maxHeight: 240 },
  content: { padding: 8, gap: 2 },
  header: { color: '#FFD60A', fontSize: 9, fontWeight: '700', marginBottom: 4 },
  entry: { color: '#FFFFFF', fontSize: 8, lineHeight: 11, fontFamily: Platform.select({ android: 'monospace', default: 'menlo' }) },
  tag: { color: '#64D2FF', fontWeight: '600' },
});
