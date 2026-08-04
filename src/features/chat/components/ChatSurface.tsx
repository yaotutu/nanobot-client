import { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ChatThreadProps } from '@/features/chat/components/ChatThread';
import { createDeferredComponent } from '@/hooks/use-deferred-component';
import type { Palette } from '@/ui/palette';

/**
 * 空会话不需要消息 Markdown、代码高亮、工具活动等渲染模块。ChatThread 仅在存在消息时加载。
 * 使用显式 state 更新挂载组件，避免 React.lazy/Suspense 在 Fabric 提交阶段触发原生崩溃。
 */
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

export function ChatSurface(props: ChatSurfaceProps) {
  const { t } = useTranslation();

  if (!props.hasMessages) {
    if (props.threadLoading) {
      return (
        <>
          <ThreadLoading colors={props.colors} label={t('thread.loadingConversation')} />
          <View style={[styles.threadComposer, { backgroundColor: props.colors.background }]}>
            {props.composer}
          </View>
        </>
      );
    }
    return (
      <View style={styles.heroArea}>
        <View style={styles.heroContent}>
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            style={[styles.greeting, { color: props.colors.foreground }]}
          >
            {t('thread.empty.greetings.workOn')}
          </Text>
          <View style={styles.heroComposer}>{props.composer}</View>
        </View>
      </View>
    );
  }

  return (
    <>
      <DeferredChatThread
        componentProps={props.threadProps}
        enabled={props.hasMessages}
        fallback={<ThreadLoading colors={props.colors} label={t('thread.loadingConversation')} />}
      />
      <View style={[styles.threadComposer, { backgroundColor: props.colors.background }]}>
        {props.composer}
      </View>
    </>
  );
}

function ThreadLoading({ colors, label }: { colors: Palette; label: string }) {
  return (
    <View style={styles.loadingThreadArea}>
      <View style={styles.loadingConversation}>
        <ActivityIndicator color={colors.muted} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 70 },
  heroContent: { width: '100%', maxWidth: 720, alignSelf: 'center', alignItems: 'center' },
  greeting: { width: '100%', fontSize: 34, lineHeight: 39, fontWeight: '400', textAlign: 'center' },
  heroComposer: { width: '100%', marginTop: 28 },
  loadingThreadArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingConversation: { alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13 },
  threadComposer: { paddingHorizontal: 10, paddingTop: 5 },
});
