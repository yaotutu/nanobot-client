import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChatThread } from '@/features/chat/components/ChatThread';
import type { Palette } from '@/ui/palette';

interface ChatSurfaceProps {
  colors: Palette;
  composer: ReactNode;
  hasMessages: boolean;
  threadLoading: boolean;
  threadProps: ComponentProps<typeof ChatThread>;
}

export function ChatSurface(props: ChatSurfaceProps) {
  const { t } = useTranslation();

  if (!props.hasMessages) {
    if (props.threadLoading) {
      return (
        <>
          <View style={styles.loadingThreadArea}>
            <View style={styles.loadingConversation}>
              <ActivityIndicator color={props.colors.muted} />
              <Text style={[styles.loadingText, { color: props.colors.muted }]}>
                {t('thread.loadingConversation')}
              </Text>
            </View>
          </View>
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
      <ChatThread {...props.threadProps} />
      <View style={[styles.threadComposer, { backgroundColor: props.colors.background }]}>
        {props.composer}
      </View>
    </>
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
