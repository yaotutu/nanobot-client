import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Check from 'lucide-react-native/icons/check';
import Copy from 'lucide-react-native/icons/copy';

import type { Palette } from '@/ui/palette';

export function ForkBoundaryDivider({ colors }: { colors: Palette }) {
  const { t } = useTranslation();
  return (
    <View style={styles.forkBoundary}>
      <View style={[styles.forkBoundaryLine, { backgroundColor: colors.border }]} />
      <Text style={[styles.forkBoundaryText, { color: colors.subtle }]}>{t('thread.forkedFromHistory')}</Text>
      <View style={[styles.forkBoundaryLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

export function MessageCopyButton({ colors, content }: { colors: Palette; content: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(content);
    setCopied(true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <Pressable
      accessibilityLabel={copied ? t('message.copiedReply') : t('message.copyReply')}
      hitSlop={7}
      onPress={() => void copy()}
      style={({ pressed }) => [styles.messageActionButton, pressed && { backgroundColor: colors.pressed }]}
    >
      {copied
        ? <Check color={colors.subtle} size={13} strokeWidth={2} />
        : <Copy color={colors.subtle} size={13} strokeWidth={1.7} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  forkBoundary: { marginVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  forkBoundaryLine: { height: StyleSheet.hairlineWidth, flex: 1 },
  forkBoundaryText: { fontSize: 11 },
  // 与引用、重试、分支按钮保持同一轻量尺寸；7px hitSlop 保留，避免小图标影响可点性。
  messageActionButton: { width: 30, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
