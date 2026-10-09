import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatThreadProps } from '@/features/chat/components/ChatThread';
import { chatLayout } from '@/features/chat/ui/chat-theme';
import { createDeferredComponent } from '@/hooks/use-deferred-component';
import type { Palette } from '@/ui/palette';

// 继续延迟加载较重的消息渲染模块；这与页面布局无关，不为旧 UI 保留切换分支。
const DeferredChatThread = createDeferredComponent(() => import(
  '@/features/chat/components/ChatThread'
).then(({ ChatThread }) => ChatThread));

interface ChatSurfaceProps {
  colors: Palette;
  /** 空状态引导只填充草稿并聚焦输入框，不自动发送，避免改变聊天业务行为。 */
  onUsePrompt: (prompt: string) => void;
  composer: ReactNode;
  hasMessages: boolean;
  threadLoading: boolean;
  threadProps: ChatThreadProps;
}

/** 空会话、历史加载和对话共用同一个底部输入区域，首条消息不会再导致输入框换位置。 */
export function ChatSurface({ colors, composer, hasMessages, threadLoading, threadProps, onUsePrompt }: ChatSurfaceProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // 三条引导覆盖常见入口：提问、拆解和审查；文本同时就是待填充的草稿。
  const prompts = [
    t('thread.empty.prompts.explain'),
    t('thread.empty.prompts.plan'),
    t('thread.empty.prompts.review'),
  ];
  return (
    <>
      <View style={styles.content}>
        {hasMessages ? (
          <DeferredChatThread
            componentProps={threadProps}
            enabled
            fallback={<ThreadLoading colors={colors} label={t('thread.loadingConversation')} />}
          />
        ) : threadLoading ? (
          <ThreadLoading colors={colors} label={t('thread.loadingConversation')} />
        ) : (
          <ScrollView contentContainerStyle={styles.emptyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.greeting, { color: colors.foreground }]}>{t('thread.empty.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>{t('thread.empty.subtitle')}</Text>
            <View style={styles.emptyPrompts}>
              {prompts.map((prompt) => (
                <Pressable
                  accessibilityLabel={t('thread.empty.usePrompt', { prompt })}
                  accessibilityRole="button"
                  key={prompt}
                  onPress={() => onUsePrompt(prompt)}
                  style={({ pressed }) => [
                    styles.emptyPromptButton,
                    {
                      backgroundColor: pressed ? colors.pressed : colors.card,
                      borderColor: pressed ? colors.subtle : colors.border,
                    },
                  ]}
                >
                  <Text numberOfLines={2} style={[styles.emptyPromptText, { color: colors.muted }]}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
      <View style={[styles.composerDock, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
        {composer}
      </View>
    </>
  );
}

function ThreadLoading({ colors, label }: { colors: Palette; label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.muted} />
      <Text style={[styles.loadingText, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { minHeight: 0, flex: 1, width: '100%', maxWidth: chatLayout.maxWidth, alignSelf: 'center' },
  // 空态只保持原视觉重心；有消息时文本允许进入顶部浮层的空白区域。
  emptyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingTop: 92, paddingBottom: 24, gap: 15 },
  greeting: { maxWidth: 350, fontSize: 28, lineHeight: 36, fontWeight: '400', letterSpacing: -1, textAlign: 'center' },
  subtitle: { maxWidth: 320, fontSize: 14, lineHeight: 23, textAlign: 'center' },
  emptyPrompts: { width: '100%', maxWidth: 380, gap: 9 },
  emptyPromptButton: { minHeight: 42, justifyContent: 'center', borderRadius: 21, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 9 },
  emptyPromptText: { fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 72, gap: 12 },
  loadingText: { fontSize: 14 },
  composerDock: { width: '100%', maxWidth: chatLayout.maxWidth, alignSelf: 'center', paddingHorizontal: chatLayout.horizontalInset, paddingTop: 0 },
});
