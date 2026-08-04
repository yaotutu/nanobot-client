import X from 'lucide-react-native/icons/x';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SessionAutomationList,
  type SessionAutomationColors,
} from '@/features/automations';
import type { SessionAutomationJob } from '@/types/api/automations';

interface SessionInfoColors extends SessionAutomationColors {
  background: string;
  border: string;
}

interface SessionInfoModalProps {
  colors: SessionInfoColors;
  loadJobs: (sessionKey: string) => Promise<SessionAutomationJob[]>;
  onClose: () => void;
  sessionKey: string | null;
  title: string;
  visible: boolean;
}

export function SessionInfoModal({
  colors,
  loadJobs,
  onClose,
  sessionKey,
  title,
  visible,
}: SessionInfoModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel={t('thread.header.sessionInfo')}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          <View style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.titleRow}>
            <View style={styles.titleArea}>
              <Text style={[styles.eyebrow, { color: colors.subtle }]}>
                {t('thread.sessionInfo.title')}
              </Text>
              <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
                {title || t('thread.sessionInfo.untitled')}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t('thread.header.sessionInfo')}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { backgroundColor: colors.pressed },
              ]}
            >
              <X color={colors.muted} size={18} strokeWidth={1.8} />
            </Pressable>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SessionAutomationList
            colors={colors}
            loadJobs={loadJobs}
            sessionKey={sessionKey}
            visible={visible}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.28)' },
  sheet: {
    maxHeight: '78%',
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  handleArea: { height: 25, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 38, height: 4, borderRadius: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleArea: { minWidth: 0, flex: 1 },
  eyebrow: { fontSize: 11.5 },
  title: { marginTop: 3, fontSize: 15, fontWeight: '600' },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
});
