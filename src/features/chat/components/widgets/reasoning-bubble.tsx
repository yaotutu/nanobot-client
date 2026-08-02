import { ChevronDown } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface ReasoningPalette {
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  pressed: string;
}

interface ReasoningBubbleProps {
  colors: ReasoningPalette;
  createdAt: number;
  latencyMs?: number;
  streaming: boolean;
  text: string;
}

function formatDuration(milliseconds: number): string {
  const seconds = milliseconds > 0 && milliseconds < 1_000
    ? 1
    : Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function ReasoningBubble({
  colors,
  createdAt,
  latencyMs,
  streaming,
  text,
}: ReasoningBubbleProps) {
  const { t } = useTranslation();
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [completionHoldOpen, setCompletionHoldOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wasStreamingRef = useRef(streaming);
  const expanded = manualExpanded ?? (streaming || completionHoldOpen);

  useEffect(() => {
    if (!streaming) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [streaming]);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = streaming;
    if (streaming) {
      const reset = setTimeout(() => setCompletionHoldOpen(false), 0);
      return () => clearTimeout(reset);
    }
    if (!wasStreaming || manualExpanded !== null) return;
    const hold = setTimeout(() => setCompletionHoldOpen(true), 0);
    const collapse = setTimeout(() => setCompletionHoldOpen(false), 900);
    return () => {
      clearTimeout(hold);
      clearTimeout(collapse);
    };
  }, [manualExpanded, streaming]);

  const duration = useMemo(() => {
    if (!streaming && Number.isFinite(latencyMs) && (latencyMs ?? 0) >= 0) {
      return latencyMs ?? 0;
    }
    return Math.max(0, now - createdAt);
  }, [createdAt, latencyMs, now, streaming]);

  const label = streaming
    ? t('message.activityThinkingFor', { duration: formatDuration(duration) })
    : duration > 0
      ? t('message.activityThoughtFor', { duration: formatDuration(duration) })
      : t('message.activityThought');

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setManualExpanded(!expanded)}
        style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.pressed }]}
      >
        <Text
          numberOfLines={1}
          style={[styles.label, { color: streaming ? colors.muted : colors.subtle }]}
        >
          {label}
        </Text>
        <ChevronDown
          color={colors.subtle}
          size={13}
          strokeWidth={1.8}
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {expanded ? (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={[styles.viewport, { borderLeftColor: colors.border }]}
        >
          <Text selectable style={[styles.text, { color: colors.muted }]}>{text}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 720, marginBottom: 8 },
  header: {
    minHeight: 28,
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: { maxWidth: 250, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  viewport: {
    maxHeight: 180,
    marginTop: 4,
    marginLeft: 3,
    borderLeftWidth: 2,
    paddingLeft: 11,
    paddingRight: 5,
  },
  text: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
});
