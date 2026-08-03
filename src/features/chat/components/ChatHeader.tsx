import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ListTodo, ListTree, Menu, Moon, Sun } from 'lucide-react-native';

import type { LocalPreferences } from '@/stores/local-preferences-store';
import type { Palette } from '@/ui/palette';

export interface ChatHeaderProps {
  colors: Palette;
  dark: boolean;
  preferences: LocalPreferences;
  activeKey: string | null;
  chatTitle: string;
  hasUserPrompts: boolean;
  onOpenDrawer: () => void;
  onOpenPromptNavigator: () => void;
  onOpenSessionInfo: () => void;
  onChangePreferences: (next: LocalPreferences) => void;
}

export function ChatHeader(props: ChatHeaderProps) {
  const { t } = useTranslation();
  const { colors, dark, preferences } = props;

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={t('thread.header.toggleSidebar')}
        hitSlop={8}
        onPress={props.onOpenDrawer}
        style={({ pressed }) => [styles.headerButton, pressed && { backgroundColor: colors.pressed }]}
      >
        <Menu color={colors.muted} size={18} strokeWidth={1.8} />
      </Pressable>
      {props.activeKey ? (
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.muted }]}>{props.chatTitle}</Text>
      ) : <View style={styles.headerTitleFill} />}
      <View style={styles.headerActions}>
        {props.activeKey && props.hasUserPrompts ? (
          <Pressable
            accessibilityLabel={t('thread.promptNavigator.open')}
            hitSlop={6}
            onPress={props.onOpenPromptNavigator}
            style={({ pressed }) => [styles.headerButton, pressed && { backgroundColor: colors.pressed }]}
          >
            <ListTree color={colors.muted} size={17} strokeWidth={1.8} />
          </Pressable>
        ) : null}
        {props.activeKey ? (
          <Pressable
            accessibilityLabel={t('thread.header.sessionInfo')}
            hitSlop={6}
            onPress={props.onOpenSessionInfo}
            style={({ pressed }) => [styles.headerButton, pressed && { backgroundColor: colors.pressed }]}
          >
            <ListTodo color={colors.muted} size={17} strokeWidth={1.8} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={t('thread.header.toggleTheme')}
          hitSlop={8}
          onPress={() => props.onChangePreferences({ ...preferences, theme: dark ? 'light' : 'dark' })}
          style={({ pressed }) => [styles.headerButton, pressed && { backgroundColor: colors.pressed }]}
        >
          {dark
            ? <Sun color={colors.muted} size={18} strokeWidth={1.8} />
            : <Moon color={colors.muted} size={18} strokeWidth={1.8} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 11,
  },
  headerButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { minWidth: 0, flex: 1, fontSize: 12, fontWeight: '500' },
  headerTitleFill: { minWidth: 0, flex: 1 },
});
