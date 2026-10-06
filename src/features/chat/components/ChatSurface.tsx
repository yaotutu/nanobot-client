import { type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  composer: ReactNode;
  hasMessages: boolean;
  threadLoading: boolean;
  threadProps: ChatThreadProps;
}

/** 空会话、历史加载和对话共用同一个底部输入区域，首条消息不会再导致输入框换位置。 */
export function ChatSurface({ colors, composer, hasMessages, threadLoading, threadProps }: ChatSurfaceProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
            <View style={[styles.welcomeMark, { backgroundColor: colors.userBubble }]}>
              <Text style={[styles.welcomeLetter, { color: colors.userText }]}>n</Text>
            </View>
            <Text style={[styles.greeting, { color: colors.foreground }]}>{t('thread.empty.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>{t('thread.empty.subtitle')}</Text>
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
  emptyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingVertical: 24, gap: 16 },
  welcomeMark: { width: 68, height: 68, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 7, transform: [{ rotate: '-6deg' }] },
  welcomeLetter: { fontSize: 42, fontWeight: '600', lineHeight: 52 },
  greeting: { maxWidth: 360, fontSize: 28, lineHeight: 38, fontWeight: '500', letterSpacing: -0.8, textAlign: 'center' },
  subtitle: { maxWidth: 300, fontSize: 15, lineHeight: 24, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  composerDock: { width: '100%', maxWidth: chatLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 10 },
});
