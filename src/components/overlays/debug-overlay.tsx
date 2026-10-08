import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getDebugEntries, getDebugVersion, notifyDebug, subscribeDebug, type DebugEntry } from '@/services/runtime/debug-log';

/**
 * Renders the debug log on-screen so we can see boot progress in release
 * builds where console.* calls are stripped by the minifier. Only visible
 * when the __DEBUG_OVERLAY flag is set (toggle via shake or dev menu).
 */

let overlayVisible = false;

export function setDebugOverlayVisible(visible: boolean): void {
  overlayVisible = visible;
  // 显式通知订阅者，避免开关变化只能等待下一条日志或平台轮询。
  notifyDebug();
}

export function DebugOverlay() {
  const [, forceUpdate] = useState(0);
  const [visible, setVisible] = useState(overlayVisible);

  useEffect(() => {
    // 所有平台共用同一套调试浮层：日志写入和显示开关共用同一个订阅事件，避免 Android/iOS 分叉。
    return subscribeDebug(() => {
      setVisible(overlayVisible);
      forceUpdate((n) => n + 1);
    });
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
  entry: { color: '#FFFFFF', fontSize: 8, lineHeight: 11, fontFamily: 'monospace' },
  tag: { color: '#64D2FF', fontWeight: '600' },
});
