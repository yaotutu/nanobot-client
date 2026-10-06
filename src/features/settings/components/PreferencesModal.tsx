import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supportedLocales } from '@/i18n/config';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import type { Palette } from '@/ui/palette';

interface PreferencesModalProps {
  colors: Palette;
  preferences: LocalPreferences;
  visible: boolean;
  onChange: (next: LocalPreferences) => void;
  onClose: () => void;
  onLogout: () => Promise<void>;
}

/**
 * 这里只管理设备本地的主题、语言和退出登录，不读取或修改服务端设置。
 * 使用原生 Modal 覆盖聊天，关闭后继续使用原来的草稿、消息列表和流式连接。
 */
export function PreferencesModal({ colors, preferences, visible, onChange, onClose, onLogout }: PreferencesModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{t('sidebar.settings')}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.button}>
            <Text style={{ color: '#208AEF' }}>{t('common.dismiss')}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.section, { color: colors.foreground }]}>{t('settings.rows.theme')}</Text>
          <View style={styles.themes}>
            {(['light', 'dark'] as const).map((theme) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: preferences.theme === theme }}
                key={theme}
                onPress={() => onChange({ ...preferences, theme })}
                style={[styles.choice, { borderColor: preferences.theme === theme ? '#208AEF' : colors.border }]}
              >
                <Text style={{ color: colors.foreground }}>{t(`settings.values.${theme}`)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.section, { color: colors.foreground }]}>{t('sidebar.language.label')}</Text>
          {supportedLocales.map((locale) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: preferences.language === locale.code }}
              key={locale.code}
              onPress={() => onChange({ ...preferences, language: locale.code })}
              style={[styles.choice, { borderColor: preferences.language === locale.code ? '#208AEF' : colors.border }]}
            >
              <Text style={{ color: colors.foreground }}>{locale.nativeLabel}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => { onClose(); void onLogout(); }}
            style={[styles.choice, styles.logout, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.errorText }}>{t('app.account.logout')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 56 },
  title: { fontSize: 20, fontWeight: '600' },
  button: { padding: 12 },
  content: { padding: 20, gap: 10 },
  section: { fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  themes: { flexDirection: 'row', gap: 10 },
  choice: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, minWidth: 100 },
  logout: { marginTop: 22 },
});
