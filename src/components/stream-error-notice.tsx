import { AlertTriangle, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StreamError } from '@/types/nanobot';

interface StreamErrorNoticeProps {
  colors: {
    errorBackground: string;
    errorText: string;
  };
  error: StreamError;
  onDismiss: () => void;
}

export function StreamErrorNotice({ colors, error, onDismiss }: StreamErrorNoticeProps) {
  const { t } = useTranslation();
  const copy = error.kind === 'message_too_big'
    ? {
        title: t('errors.messageTooBig.title'),
        body: t('errors.messageTooBig.body'),
      }
    : error.kind === 'workspace_scope_rejected'
      ? {
          title: t('errors.workspaceScopeRejected.title'),
          body: t('errors.workspaceScopeRejected.body'),
        }
      : {
          title: t('errors.turnRejected.title'),
          body: t('errors.turnRejected.body'),
        };
  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={[
        styles.notice,
        {
          backgroundColor: colors.errorBackground,
          borderColor: colors.errorText,
        },
      ]}
    >
      <AlertTriangle
        color={colors.errorText}
        size={16}
        strokeWidth={1.9}
        style={styles.icon}
      />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.errorText }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: colors.errorText }]}>{copy.body}</Text>
      </View>
      <Pressable
        accessibilityLabel={t('common.dismiss')}
        hitSlop={8}
        onPress={onDismiss}
        style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
      >
        <X color={colors.errorText} size={15} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginBottom: 8,
    minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  icon: { marginTop: 2 },
  copy: { minWidth: 0, flex: 1 },
  title: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  body: { marginTop: 1, fontSize: 12, lineHeight: 18, opacity: 0.82 },
  dismiss: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissPressed: { opacity: 0.58 },
});
