import PanelLeft from 'lucide-react-native/icons/panel-left';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HeaderActivityPill } from '@/features/chat/components/HeaderActivityPill';
import { HeaderAvatar } from '@/features/chat/components/HeaderAvatar';
import type { HeaderActivity } from '@/features/chat/activity/model/header-activity';
import { chatLayout } from '@/features/chat/ui/chat-theme';
import type { Palette } from '@/ui/palette';

export interface ChatHeaderProps {
  colors: Palette;
  onOpenConversations: () => void;
  onOpenChatOptions: () => void;
  onOpenAgentActivity: () => void;
  headerActivity?: HeaderActivity;
}

/** 仅还原参考 UI 的品牌层级；形象与操作仍属于 nanobot，不引入参考项目的通知或电脑业务。 */
export function ChatHeader({
  colors,
  headerActivity,
  onOpenAgentActivity,
  onOpenChatOptions,
  onOpenConversations,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const idleActivity: HeaderActivity = { phase: 'idle', reasoningStepCount: 0, toolCallCount: 0, fileEditCount: 0 };
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('thread.header.openConversations')}
        onPress={onOpenConversations}
        style={({ pressed }) => [styles.button, styles.menuButton, { backgroundColor: pressed ? colors.pressed : colors.card }]}
      >
        <PanelLeft color={colors.foreground} size={19} strokeWidth={1.7} />
      </Pressable>
      <Pressable
        accessibilityLabel={t('thread.agentActivity.open')}
        accessibilityRole="button"
        onPress={onOpenAgentActivity}
        style={({ pressed }) => [
          styles.heading,
          {
            backgroundColor: pressed ? colors.pressed : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <HeaderAvatar phase={(headerActivity ?? idleActivity).phase} />
        <Text style={[styles.brand, { color: colors.foreground }]}>{t('app.brand')}</Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>{t('thread.header.subtitle')}</Text>
        {/* 头像、品牌与状态胶囊同属一个可点击区域；点击后始终进入 Agent 活动面板。 */}
        <HeaderActivityPill
          activity={headerActivity ?? idleActivity}
          colors={colors}
        />
      </Pressable>
      {/* 模型、工作区和权限属于当前会话，入口与会话标题同层；新建会话保留在会话面板。 */}
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
  // 顶部是悬浮层；中央卡片比原来略高，避免头像和胶囊贴着消息内容。
  header: { height: 134, width: '100%', maxWidth: chatLayout.maxWidth, alignSelf: 'center', paddingTop: 2 },
  button: { position: 'absolute', top: 16, width: 44, height: 44, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  menuButton: { left: 20 },
  optionsButton: { right: 20 },
  // 中央品牌入口叠在消息内容上，必须像左右按钮一样有卡片背景，避免透明区域和消息文字混在一起。
  heading: {
    alignSelf: 'center',
    maxWidth: '68%',
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 6,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
  },
  brand: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.4 },
  subtitle: { fontSize: 11, lineHeight: 16, marginBottom: 5 },
});
