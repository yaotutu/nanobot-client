import { Search, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { sessionTitle, visibleSessionPreview } from '@/services/text/format';
import type { ChatSummary } from '@/types/api';

interface SessionSearchColors {
  background: string;
  card: string;
  foreground: string;
  muted: string;
  border: string;
  pressed: string;
}

interface SessionSearchModalProps {
  activeKey: string | null;
  colors: SessionSearchColors;
  loading: boolean;
  onClose: () => void;
  onSelect: (key: string) => void;
  sessions: ChatSummary[];
  titleOverrides?: Record<string, string>;
  visible: boolean;
}

export function SessionSearchModal({
  activeKey,
  colors,
  loading,
  onClose,
  onSelect,
  sessions,
  titleOverrides = {},
  visible,
}: SessionSearchModalProps) {
  const { i18n, t } = useTranslation();
  const { height, width } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const locale = i18n.resolvedLanguage || i18n.language;

  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const results = useMemo(() => {
    if (!visible) return [];
    if (!normalizedQuery) return sessions;
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return sessions.filter((session) => sessionMatchesTerms(
      session,
      terms,
      titleOverrides[session.key],
    ));
  }, [normalizedQuery, sessions, titleOverrides, visible]);

  const choose = (key: string) => {
    onClose();
    onSelect(key);
  };

  return (
    <Modal
      animationType="fade"
      onShow={() => inputRef.current?.focus()}
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <Pressable accessibilityLabel={t('common.dismiss')} onPress={onClose} style={styles.backdrop} />
        <View
          accessibilityLabel={t('sidebar.searchAria')}
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              maxHeight: Math.min(640, Math.max(240, height - 32)),
              width: Math.min(672, Math.max(280, width - 32)),
            },
          ]}
        >
          <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
            <Search color={colors.muted} size={18} strokeWidth={1.9} />
            <TextInput
              accessibilityLabel={t('sidebar.searchAria')}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              onSubmitEditing={() => {
                const first = results[0];
                if (first) choose(first.key);
              }}
              placeholder={t('sidebar.searchPlaceholder')}
              placeholderTextColor={colors.muted}
              ref={inputRef}
              returnKeyType="go"
              style={[styles.searchInput, { color: colors.foreground }]}
              value={query}
            />
            {query ? (
              <Pressable
                accessibilityLabel={t('common.dismiss')}
                hitSlop={8}
                onPress={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                style={({ pressed }) => [styles.clearButton, pressed && { backgroundColor: colors.pressed }]}
              >
                <X color={colors.muted} size={17} strokeWidth={1.9} />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            contentContainerStyle={styles.resultsContent}
            data={results}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.key}
            ListEmptyComponent={
              <Text selectable style={[styles.emptyText, { color: colors.muted }]}>
                {loading && sessions.length === 0
                  ? t('chat.loading')
                  : normalizedQuery
                    ? t('sidebar.noSearchResults')
                    : t('chat.noSessions')}
              </Text>
            }
            ListHeaderComponent={
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                {normalizedQuery ? t('sidebar.searchResults') : t('sidebar.recent')}
              </Text>
            }
            renderItem={({ item }) => {
              const title = titleOverrides[item.key]?.trim() || sessionTitle(item);
              const preview = visibleSessionPreview(item.preview);
              const showPreview = preview.length > 0
                && preview.toLocaleLowerCase(locale) !== title.toLocaleLowerCase(locale);
              const active = item.key === activeKey;
              const currentLabel = t('thread.composer.slash.badges.current');
              return (
                <Pressable
                  accessibilityLabel={active ? `${title}, ${currentLabel}` : title}
                  accessibilityRole="button"
                  onPress={() => choose(item.key)}
                  style={({ pressed }) => [
                    styles.resultRow,
                    (pressed || active) && { backgroundColor: colors.pressed },
                  ]}
                >
                  <View style={styles.resultCopy}>
                    <Text numberOfLines={1} style={[styles.resultTitle, { color: colors.foreground }]}>
                      {title}
                    </Text>
                    {showPreview ? (
                      <Text numberOfLines={1} style={[styles.resultPreview, { color: colors.muted }]}>
                        {preview}
                      </Text>
                    ) : null}
                  </View>
                  {active ? (
                    <View style={[styles.currentBadge, { backgroundColor: colors.background }]}>
                      <Text style={[styles.currentText, { color: colors.muted }]}>{currentLabel}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function sessionMatchesTerms(
  session: ChatSummary,
  terms: string[],
  titleOverride?: string,
): boolean {
  const haystack = [titleOverride, session.title, visibleSessionPreview(session.preview)]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('zh-CN');
  return terms.every((term) => haystack.includes(term));
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(15,15,14,0.46)',
  },
  card: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 22px 70px rgba(0,0,0,0.28)',
  },
  searchRow: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
  },
  searchInput: {
    minWidth: 0,
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 19,
    fontWeight: '400',
  },
  clearButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  resultsContent: {
    padding: 10,
    paddingBottom: 12,
  },
  sectionLabel: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 6,
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    paddingHorizontal: 12,
    paddingVertical: 28,
    fontSize: 13,
  },
  resultRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resultCopy: {
    minWidth: 0,
    flex: 1,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  resultPreview: {
    fontSize: 12,
    lineHeight: 16,
  },
  currentBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  currentText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
