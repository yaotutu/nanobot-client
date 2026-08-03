import { Menu, Moon, Sun } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppUtilityView } from '@/features/app/model/navigation';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import type { Palette } from '@/ui/palette';

interface AppUtilityWorkspaceProps {
  children: React.ReactNode;
  colors: Palette;
  dark: boolean;
  onChangePreferences: (next: LocalPreferences) => void;
  onOpenDrawer: () => void;
  preferences: LocalPreferences;
  view: Exclude<AppUtilityView, 'chat'>;
}

export function AppUtilityWorkspace(props: AppUtilityWorkspaceProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const title = props.view === 'apps'
    ? t('sidebar.apps')
    : props.view === 'skills'
      ? t('sidebar.skills.title')
      : props.view === 'automations'
        ? t('sidebar.automations')
        : t('sidebar.settings');

  return (
    <View style={[styles.root, { backgroundColor: props.colors.background }]}> 
      <View style={{ height: insets.top }} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={t('thread.header.toggleSidebar')}
          hitSlop={8}
          onPress={props.onOpenDrawer}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && { backgroundColor: props.colors.pressed },
          ]}
        >
          <Menu color={props.colors.muted} size={18} strokeWidth={1.8} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.title, { color: props.colors.muted }]}> 
          {title}
        </Text>
        <Pressable
          accessibilityLabel={t('thread.header.toggleTheme')}
          hitSlop={8}
          onPress={() => props.onChangePreferences({
            ...props.preferences,
            theme: props.dark ? 'light' : 'dark',
          })}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && { backgroundColor: props.colors.pressed },
          ]}
        >
          {props.dark
            ? <Sun color={props.colors.muted} size={18} strokeWidth={1.8} />
            : <Moon color={props.colors.muted} size={18} strokeWidth={1.8} />}
        </Pressable>
      </View>
      <View style={styles.content}>{props.children}</View>
      <View style={{ height: Math.max(insets.bottom, 7) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 11,
  },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { minWidth: 0, flex: 1, fontSize: 12, fontWeight: '500' },
  content: { flex: 1 },
});
