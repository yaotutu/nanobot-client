import FileText from 'lucide-react-native/icons/file-text';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ImageLibrary from 'lucide-react-native/icons/image';
import X from 'lucide-react-native/icons/x';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Palette } from '@/ui/palette';

interface AttachmentPickerSheetProps {
  colors: Palette;
  visible: boolean;
  onClose: () => void;
  onPickImages: () => void;
  onPickDocuments: () => void;
}

type PickerOption = {
  key: 'image' | 'file';
  title: string;
  hint: string;
  icon: typeof ImageLibrary;
};

/** 附件来源选择：保留手机底部弹窗交互，不复用系统 Alert 的丑陋原生样式。 */
export function AttachmentPickerSheet({
  colors,
  visible,
  onClose,
  onPickDocuments,
  onPickImages,
}: AttachmentPickerSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const options: PickerOption[] = [
    {
      key: 'image',
      title: t('thread.composer.attachmentPicker.imageTitle'),
      hint: t('thread.composer.attachmentPicker.imageHint'),
      icon: ImageLibrary,
    },
    {
      key: 'file',
      title: t('thread.composer.attachmentPicker.fileTitle'),
      hint: t('thread.composer.attachmentPicker.fileHint'),
      icon: FileText,
    },
  ];

  const choose = (key: PickerOption['key']) => {
    onClose();
    if (key === 'image') onPickImages();
    else onPickDocuments();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      testID="attachment-picker-modal"
      transparent
      visible={visible}
    >
      <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          accessibilityLabel={t('thread.composer.attachmentPicker.close')}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              width: Math.min(430, width - 16),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {t('thread.composer.attachmentPicker.title')}
              </Text>
              <Text numberOfLines={2} style={[styles.subtitle, { color: colors.muted }]}>
                {t('thread.composer.attachmentPicker.subtitle')}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t('thread.composer.attachmentPicker.close')}
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: pressed ? colors.pressed : colors.card },
              ]}
            >
              <X color={colors.muted} size={18} strokeWidth={1.8} />
            </Pressable>
          </View>
          <View style={styles.options}>
            {options.map(({ icon: Icon, key, hint, title }) => (
              <Pressable
                accessibilityLabel={title}
                accessibilityRole="button"
                key={key}
                onPress={() => choose(key)}
                style={({ pressed }) => [
                  styles.option,
                  { backgroundColor: pressed ? colors.pressed : colors.card },
                ]}
              >
                <View style={[styles.optionIcon, { backgroundColor: colors.userBubble }]}>
                  <Icon color={colors.userText} size={20} strokeWidth={1.8} />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionTitle, { color: colors.foreground }]}>{title}</Text>
                  <Text numberOfLines={1} style={[styles.optionHint, { color: colors.muted }]}>
                    {hint}
                  </Text>
                </View>
                <ChevronRight color={colors.subtle} size={18} strokeWidth={1.8} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 25, 28, 0.28)',
  },
  sheet: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerCopy: { minWidth: 0, flex: 1, gap: 3 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -0.4 },
  subtitle: { fontSize: 12.5, lineHeight: 18 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: { gap: 8, paddingHorizontal: 14, paddingBottom: 2 },
  option: {
    minHeight: 66,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCopy: { minWidth: 0, flex: 1, gap: 2 },
  optionTitle: { fontSize: 14.5, lineHeight: 20, fontWeight: '600' },
  optionHint: { fontSize: 11.5, lineHeight: 16 },
});
