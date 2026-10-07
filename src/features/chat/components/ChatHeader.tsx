import ListTree from 'lucide-react-native/icons/list-tree';
import Menu from 'lucide-react-native/icons/menu';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { chatLayout } from '@/features/chat/ui/chat-theme';
import type { Palette } from '@/ui/palette';

// Metro 静态资源必须使用 require，让 Android/iOS 构建器打包现有品牌图像。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nanobotIcon = require('../../../../assets/images/nanobot-icon.png');

export interface ChatHeaderProps {
  colors: Palette;
  chatTitle: string;
  hasUserPrompts: boolean;
  onOpenDrawer: () => void;
  onOpenPromptNavigator: () => void;
  onOpenChatOptions: () => void;
}

/** 仅还原参考 UI 的品牌层级；形象与操作仍属于 nanobot，不引入参考项目的通知或电脑业务。 */
export function ChatHeader({ colors, chatTitle, hasUserPrompts, onOpenDrawer, onOpenPromptNavigator, onOpenChatOptions }: ChatHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('thread.header.toggleSidebar')}
        onPress={onOpenDrawer}
        style={({ pressed }) => [styles.button, styles.menuButton, { backgroundColor: pressed ? colors.pressed : colors.card }]}
      >
        <Menu color={colors.foreground} size={19} strokeWidth={1.7} />
      </Pressable>
      <View style={styles.heading}>
        <Image accessible={false} source={nanobotIcon} resizeMode="contain" style={styles.avatar} />
        <Text style={[styles.brand, { color: colors.foreground }]}>{t('app.brand')}</Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>{t('thread.header.subtitle')}</Text>
        {/* 原版的状态胶囊换成真实的会话导航，不绘制没有业务含义的在线圆点。 */}
        <Pressable
          accessibilityRole={hasUserPrompts ? 'button' : undefined}
          accessibilityLabel={hasUserPrompts ? t('thread.promptNavigator.open') : undefined}
          disabled={!hasUserPrompts}
          hitSlop={{ top: 5, bottom: 5 }}
          onPress={onOpenPromptNavigator}
          style={({ pressed }) => [styles.topic, { backgroundColor: colors.pressed, opacity: pressed ? 0.72 : 1 }]}
        >
          {hasUserPrompts ? <ListTree color={colors.muted} size={12} strokeWidth={1.7} /> : null}
          <Text numberOfLines={1} style={[styles.topicText, { color: colors.muted }]}>{hasUserPrompts ? chatTitle : t('sidebar.newChat')}</Text>
        </Pressable>
      </View>
      {/* 模型、工作区和权限属于当前会话，入口与会话标题同层；新建会话保留在侧栏。 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('thread.composer.options')}
        onPress={onOpenChatOptions}
        style={({ pressed }) => [styles.button, styles.optionsButton, { backgroundColor: pressed ? colors.pressed : colors.card }]}
      >
        <SlidersHorizontal color={colors.foreground} size={19} strokeWidth={1.7} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 与参考手机页相同的 122 高顶栏，左右操作不挤占中间品牌与会话胶囊。
  header: { height: 122, width: '100%', maxWidth: chatLayout.maxWidth, alignSelf: 'center', paddingTop: 2 },
  button: { position: 'absolute', top: 16, width: 44, height: 44, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  menuButton: { left: 20 },
  optionsButton: { right: 20 },
  heading: { alignSelf: 'center', maxWidth: '68%', alignItems: 'center', gap: 1 },
  avatar: { width: 49, height: 49 },
  brand: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.4 },
  subtitle: { fontSize: 11, lineHeight: 16, marginBottom: 5 },
  topic: { minHeight: 28, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  topicText: { flexShrink: 1, fontSize: 11, lineHeight: 16 },
});
