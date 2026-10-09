import PanelLeft from 'lucide-react-native/icons/panel-left';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { HeaderActivityPill } from '@/features/chat/components/HeaderActivityPill';
import { HeaderAvatar } from '@/features/chat/components/HeaderAvatar';
import type { HeaderActivity } from '@/features/chat/activity/model/header-activity';
import { chatLayout } from '@/features/chat/ui/chat-layout';
import type { Palette } from '@/ui/palette';

export interface ChatHeaderProps {
  colors: Palette;
  onOpenConversations: () => void;
  onOpenChatOptions: () => void;
  onOpenAgentActivity: () => void;
  headerActivity?: HeaderActivity;
}

/** 三个独立悬浮入口：左右管理会话，中央头像和胶囊展示同一个 Agent 的工作状态。 */
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
    <View pointerEvents="box-none" style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('thread.header.openConversations')}
        onPress={onOpenConversations}
        style={({ pressed }) => [styles.button, styles.menuButton, { backgroundColor: colors.pressed, opacity: pressed ? 0.7 : 1 }]}
      >
        <PanelLeft color={colors.foreground} size={21} strokeWidth={1.7} />
      </Pressable>
      <Pressable
        accessibilityLabel={t('thread.agentActivity.open')}
        accessibilityRole="button"
        onPress={onOpenAgentActivity}
        style={({ pressed }) => [styles.heading, { opacity: pressed ? 0.8 : 1 }]}
      >
        {/* 圆形底座隔开正文；素材保留完整画幅，动图切换不会改变入口的占位尺寸。 */}
        <View style={styles.avatarFrame} testID="header-avatar-frame">
          <HeaderAvatar phase={(headerActivity ?? idleActivity).phase} size={72} />
        </View>
        {/* 身份与工作状态复用同一条胶囊，不再叠加品牌、副标题和状态三行文字。 */}
        <HeaderActivityPill
          activity={headerActivity ?? idleActivity}
          colors={colors}
        />
      </Pressable>
      {/* 模型、工作区和权限属于当前会话；不恢复会话标题或增加其他业务入口。 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('thread.composer.options')}
        onPress={onOpenChatOptions}
        style={({ pressed }) => [styles.button, styles.optionsButton, { backgroundColor: colors.pressed, opacity: pressed ? 0.7 : 1 }]}
      >
        <SlidersHorizontal color={colors.foreground} size={21} strokeWidth={1.7} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: chatLayout.headerHeight, width: '100%', maxWidth: chatLayout.maxWidth, alignSelf: 'center', paddingTop: 4 },
  button: { position: 'absolute', top: 18, width: chatLayout.controlSize, height: chatLayout.controlSize, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menuButton: { left: chatLayout.horizontalInset },
  optionsButton: { right: chatLayout.horizontalInset },
  // 外层不铺背景，留白仍可滚动；只有头像底座和贴合的胶囊遮住其下的文字。
  heading: { alignSelf: 'center', maxWidth: '60%', alignItems: 'center' },
  avatarFrame: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5E4' },
});
