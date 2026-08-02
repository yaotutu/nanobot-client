import { Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDateTime } from '@/services/text/format';
import { userPromptAnchors } from '@/features/chat/prompt-navigation';
import type { UIMessage } from '@/types/api/chat';

interface PromptNavigatorColors {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
}

interface PromptNavigatorProps {
  colors: PromptNavigatorColors;
  messages: UIMessage[];
  onClose: () => void;
  onJumpToPrompt: (promptId: string) => void;
  visible: boolean;
}

export function PromptNavigator({
  colors,
  messages,
  onClose,
  onJumpToPrompt,
  visible,
}: PromptNavigatorProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const prompts = useMemo(() => userPromptAnchors(messages), [messages]);
  const filteredPrompts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return prompts;
    return prompts.filter((prompt) =>
      `${prompt.label}\n${prompt.preview}`.toLocaleLowerCase().includes(needle),
    );
  }, [prompts, query]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable accessibilityLabel={t('common.dismiss')} onPress={close} style={StyleSheet.absoluteFill} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderLeftColor: colors.border,
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.foreground }]}>{t('thread.promptNavigator.title')}</Text>
              <Pressable
                accessibilityLabel={t('common.dismiss')}
                hitSlop={8}
                onPress={close}
                style={({ pressed }) => [styles.closeButton, pressed && { backgroundColor: colors.pressed }]}
              >
                <X color={colors.muted} size={18} strokeWidth={1.8} />
              </Pressable>
            </View>
            <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Search color={colors.subtle} size={16} strokeWidth={1.8} />
              <TextInput
                autoCorrect={false}
                onChangeText={setQuery}
                accessibilityLabel={t('thread.promptNavigator.search')}
                placeholder={t('thread.promptNavigator.search')}
                placeholderTextColor={colors.subtle}
                returnKeyType="search"
                style={[styles.searchInput, { color: colors.foreground }]}
                value={query}
              />
              {query ? (
                <Pressable accessibilityLabel={t('common.dismiss')} hitSlop={8} onPress={() => setQuery('')}>
                  <X color={colors.subtle} size={15} strokeWidth={1.8} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <FlatList
            contentContainerStyle={filteredPrompts.length ? styles.listContent : styles.emptyContent}
            data={filteredPrompts}
            keyExtractor={(prompt) => prompt.id}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityLabel={t('thread.promptNavigator.jumpTo', { label: item.label })}
                onPress={() => {
                  close();
                  onJumpToPrompt(item.id);
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.pressed }]}
              >
                <Text numberOfLines={4} style={[styles.preview, { color: colors.foreground }]}>
                  {item.preview}
                </Text>
                {item.createdAt ? (
                  <Text style={[styles.timestamp, { color: colors.subtle }]}>
                    {formatDateTime(item.createdAt)}
                  </Text>
                ) : null}
              </Pressable>
            )}
            ListEmptyComponent={(
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t('thread.promptNavigator.noResults')}</Text>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  sheet: {
    width: '92%',
    maxWidth: 384,
    height: '100%',
    borderLeftWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  titleRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: '600' },
  closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    height: 42,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 21,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { minWidth: 0, flex: 1, height: 41, paddingVertical: 0, fontSize: 14 },
  listContent: { paddingHorizontal: 8, paddingVertical: 8 },
  emptyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  row: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12 },
  preview: { fontSize: 14, lineHeight: 20 },
  timestamp: { marginTop: 5, fontSize: 10.5, lineHeight: 15 },
  emptyText: { fontSize: 13, textAlign: 'center' },
});
