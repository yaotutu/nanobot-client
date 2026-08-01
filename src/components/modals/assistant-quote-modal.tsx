import { Quote, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  MAX_QUOTED_CONTEXT_CHARS,
  normalizeQuotedContext,
} from '@/services/text/user-quote-format';

interface AssistantQuoteColors {
  background: string;
  border: string;
  card: string;
  foreground: string;
  muted: string;
  pressed: string;
  subtle: string;
}

interface AssistantQuoteModalProps {
  colors: AssistantQuoteColors;
  content: string | null;
  onClose: () => void;
  onConfirm: (content: string) => void;
}

interface TextSelection {
  end: number;
  start: number;
}

export function AssistantQuoteModal({
  colors,
  content,
  onClose,
  onConfirm,
}: AssistantQuoteModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const visible = content !== null;
  const source = content ?? '';

  const selectedText = useMemo(() => {
    const start = Math.max(0, Math.min(selection.start, source.length));
    const end = Math.max(start, Math.min(selection.end, source.length));
    return normalizeQuotedContext(source.slice(start, end));
  }, [selection.end, selection.start, source]);

  const confirm = () => {
    if (!selectedText) return;
    onConfirm(selectedText);
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => {
        setSelection({ start: 0, end: source.length });
        inputRef.current?.focus();
      }}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable accessibilityLabel={t('common.dismiss')} onPress={onClose} style={styles.backdrop} />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              maxHeight: Math.max(320, height - Math.max(insets.top, 16) - 20),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={[styles.headerIcon, { backgroundColor: colors.pressed }]}>
              <Quote color={colors.foreground} size={17} strokeWidth={1.9} />
            </View>
            <View style={styles.headerCopy}>
              <Text selectable style={[styles.title, { color: colors.foreground }]}>
                {t('message.quoteSelectionTitle')}
              </Text>
              <Text selectable style={[styles.subtitle, { color: colors.muted }]}>
                {t('message.quoteSelectionHint', { max: MAX_QUOTED_CONTEXT_CHARS })}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t('common.dismiss')}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <X color={colors.muted} size={19} strokeWidth={1.9} />
            </Pressable>
          </View>

          <TextInput
            accessibilityLabel={t('message.quoteSelectionField')}
            contextMenuHidden={false}
            multiline
            onChangeText={() => {}}
            onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
            ref={inputRef}
            scrollEnabled
            selectTextOnFocus
            selection={selection}
            selectionColor={colors.foreground}
            showSoftInputOnFocus={false}
            style={[
              styles.selectionInput,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={source}
          />

          <View style={styles.footer}>
            <Text selectable style={[styles.count, { color: selectedText ? colors.muted : colors.subtle }]}>
              {t('message.quoteSelectionCount', {
                count: selectedText.length,
                max: MAX_QUOTED_CONTEXT_CHARS,
              })}
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.border },
                  pressed && { backgroundColor: colors.pressed },
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                  {t('message.quoteSelectionCancel')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityState={{ disabled: !selectedText }}
                disabled={!selectedText}
                onPress={confirm}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.foreground },
                  !selectedText && { opacity: 0.35 },
                  pressed && selectedText && { opacity: 0.78 },
                ]}
              >
                <Quote color={colors.background} size={15} strokeWidth={2} />
                <Text style={[styles.primaryButtonText, { color: colors.background }]}>
                  {t('message.quoteSelectionConfirm')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet: {
    minHeight: 390,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  header: {
    minHeight: 74,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  headerIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { minWidth: 0, flex: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { marginTop: 2, fontSize: 11.5, lineHeight: 16 },
  closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  selectionInput: {
    minHeight: 210,
    flex: 1,
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  footer: { gap: 10, paddingTop: 10 },
  count: { fontSize: 11, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  secondaryButton: {
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 17,
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '600' },
  primaryButton: {
    minHeight: 42,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
  },
  primaryButtonText: { fontSize: 13, fontWeight: '700' },
});
