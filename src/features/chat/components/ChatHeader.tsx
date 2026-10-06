import ListTree from 'lucide-react-native/icons/list-tree';
import Menu from 'lucide-react-native/icons/menu';
import SquarePen from 'lucide-react-native/icons/square-pen';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chatLayout } from '@/features/chat/ui/chat-theme';
import type { Palette } from '@/ui/palette';

export interface ChatHeaderProps {
  colors: Palette;
  chatTitle: string;
  hasUserPrompts: boolean;
  onOpenDrawer: () => void;
  onOpenPromptNavigator: () => void;
  onStartNewChat: () => void;
}

/** 顶部仅保留会话相关操作；主题切换统一由设置管理，不再占用聊天页工具栏。 */
export function ChatHeader({ colors, chatTitle, hasUserPrompts, onOpenDrawer, onOpenPromptNavigator, onStartNewChat }: ChatHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('thread.header.toggleSidebar')}
        onPress={onOpenDrawer}
        style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.pressed : colors.card }]}
      >
        <Menu color={colors.foreground} size={21} strokeWidth={1.8} />
      </Pressable>
      <View style={styles.heading}>
        {hasUserPrompts ? <Text style={[styles.brand, { color: colors.subtle }]}>{t('app.brand')}</Text> : null}
        <Pressable
          accessibilityRole={hasUserPrompts ? 'button' : undefined}
          accessibilityLabel={hasUserPrompts ? t('thread.promptNavigator.open') : undefined}
          disabled={!hasUserPrompts}
          onPress={onOpenPromptNavigator}
          style={styles.titleRow}
        >
          <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>{chatTitle}</Text>
          {hasUserPrompts ? <ListTree color={colors.subtle} size={14} strokeWidth={1.8} /> : null}
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('sidebar.newChat')}
        onPress={onStartNewChat}
        style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.pressed : colors.card }]}
      >
        <SquarePen color={colors.foreground} size={20} strokeWidth={1.8} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 82, width: '100%', maxWidth: chatLayout.maxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: chatLayout.horizontalInset, paddingVertical: 12 },
  button: { width: chatLayout.controlSize, height: chatLayout.controlSize, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  heading: { minWidth: 0, flex: 1, alignItems: 'center', gap: 4 },
  brand: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1 },
  titleRow: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  title: { flexShrink: 1, fontSize: 18, lineHeight: 25, fontWeight: '600', letterSpacing: -0.4 },
});
