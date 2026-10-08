import PanelLeft from 'lucide-react-native/icons/panel-left';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { HeaderActivityPill } from '@/features/chat/components/HeaderActivityPill';
import type { HeaderActivity } from '@/features/chat/activity/model/header-activity';
import { chatLayout } from '@/features/chat/ui/chat-theme';
import type { Palette } from '@/ui/palette';

// Metro 静态资源必须使用 require，让 Android/iOS 构建器打包现有品牌图像。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nanobotIcon = require('../../../../assets/images/nanobot-icon.png');

export interface ChatHeaderProps {
  colors: Palette;
  chatTitle: string;
  hasUserPrompts: boolean;
  onOpenConversations: () => void;
  onOpenChatOptions: () => void;
  onOpenAgentActivity: () => void;
  headerActivity?: HeaderActivity;
}

/** 仅还原参考 UI 的品牌层级；形象与操作仍属于 nanobot，不引入参考项目的通知或电脑业务。 */
export function ChatHeader({
  colors,
  chatTitle,
  hasUserPrompts,
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
        style={({ pressed }) => [styles.heading, pressed && styles.pressFeedback]}
      >
        <Image accessible={false} source={nanobotIcon} resizeMode="contain" style={styles.avatar} />
        <Text style={[styles.brand, { color: colors.foreground }]}>{t('app.brand')}</Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>{t('thread.header.subtitle')}</Text>
        {/* 头像、品牌与状态胶囊同属一个可点击区域；点击后始终进入 Agent 活动面板。 */}
        <HeaderActivityPill
          activity={headerActivity ?? idleActivity}
          chatTitle={chatTitle}
          colors={colors}
          hasUserPrompts={hasUserPrompts}
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
  // 与参考手机页相同的 122 高顶栏，左右操作不挤占中间品牌与会话胶囊。
  header: { height: 122, width: '100%', maxWidth: chatLayout.maxWidth, alignSelf: 'center', paddingTop: 2 },
  button: { position: 'absolute', top: 16, width: 44, height: 44, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  menuButton: { left: 20 },
  optionsButton: { right: 20 },
  heading: { alignSelf: 'center', maxWidth: '68%', alignItems: 'center', gap: 1 },
  avatar: { width: 49, height: 49 },
  brand: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.4 },
  subtitle: { fontSize: 11, lineHeight: 16, marginBottom: 5 },
  // 头像区域没有圆形背景，按压透明度是明确的触控反馈，不做平台分支。
  pressFeedback: { opacity: 0.72 },
});
