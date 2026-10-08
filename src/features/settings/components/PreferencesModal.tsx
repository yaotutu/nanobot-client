import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Download from 'lucide-react-native/icons/download';
import Languages from 'lucide-react-native/icons/languages';
import LogOut from 'lucide-react-native/icons/log-out';
import Moon from 'lucide-react-native/icons/moon';
import Sun from 'lucide-react-native/icons/sun';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hasUpdate, UpdateDetails, updateSummaryKey, type UpdateState } from '@/features/updates';
import { localeOption, normalizeLocale, supportedLocales } from '@/i18n/config';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import type { Palette } from '@/ui/palette';
import { createPreferencesStyles } from './preferences-styles';

interface PreferencesModalProps {
  colors: Palette;
  updates: UpdateState;
  preferences: LocalPreferences;
  visible: boolean;
  onChange: (next: LocalPreferences) => void;
  onClose: () => void;
  onLogout: () => Promise<void>;
}

type PreferencesPage = 'home' | 'theme' | 'language' | 'updates';

/**
 * 关闭时卸载内部页面状态，重新打开始终回到设置首页。
 * 只覆盖聊天界面，不重建聊天、清空草稿或修改网关连接。
 */
export function PreferencesModal(props: PreferencesModalProps) {
  return props.visible ? <PreferencesContent {...props} /> : null;
}

function PreferencesContent({ colors, preferences, updates, onChange, onClose, onLogout }: PreferencesModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<PreferencesPage>('home');
  const styles = createPreferencesStyles(colors);
  const title = page === 'updates' ? t('updates.title') : page === 'home' ? t('sidebar.settings') : page === 'theme' ? t('settings.rows.theme') : t('sidebar.language.label');
  // 系统返回与左上角返回遵循相同层级：选择页返回首页，首页才关闭弹窗。
  const goBack = () => page === 'home' ? onClose() : setPage('home');
  const ThemeIcon = preferences.theme === 'light' ? Sun : Moon;

  return (
    <Modal animationType="slide" onRequestClose={goBack} visible>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.frame}>
          <View style={styles.toolbar}>
            {page !== 'home' ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('settings.preferences.back')} onPress={goBack} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <ArrowLeft size={22} color={colors.foreground} />
              </Pressable>
            ) : <View style={styles.iconButton} />}
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.dismiss')} onPress={onClose} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <X size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView key={page} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              <Text style={styles.description}>{t(page === 'updates' ? 'updates.hint' : page === 'home' ? 'settings.preferences.note' : page === 'theme' ? 'settings.preferences.themeHint' : 'settings.preferences.languageHint')}</Text>
            </View>
            {page === 'home' ? (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t('settings.preferences.group')}</Text>
                  <View style={styles.group}>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('settings.rows.theme')} accessibilityValue={{ text: t('settings.values.' + preferences.theme) }} onPress={() => setPage('theme')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                      <View style={styles.iconTile}><ThemeIcon size={20} color={colors.foreground} /></View>
                      <Text style={styles.rowLabel}>{t('settings.rows.theme')}</Text>
                      <Text numberOfLines={1} style={styles.value}>{t('settings.values.' + preferences.theme)}</Text>
                      <ChevronRight size={18} color={colors.subtle} />
                    </Pressable>
                    <View style={styles.divider} />
                    <Pressable accessibilityRole="button" accessibilityLabel={t('sidebar.language.label')} accessibilityValue={{ text: localeOption(normalizeLocale(preferences.language)).nativeLabel }} onPress={() => setPage('language')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                      <View style={styles.iconTile}><Languages size={20} color={colors.foreground} /></View>
                      <Text style={styles.rowLabel}>{t('sidebar.language.label')}</Text>
                      <Text numberOfLines={1} style={styles.value}>{localeOption(normalizeLocale(preferences.language)).nativeLabel}</Text>
                      <ChevronRight size={18} color={colors.subtle} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t('updates.appGroup')}</Text>
                  <View style={styles.group}>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('updates.title')} accessibilityValue={{ text: t(updateSummaryKey(updates)) }} onPress={() => setPage('updates')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                      <View style={styles.iconTile}><Download size={20} color={colors.foreground} /></View>
                      <Text style={styles.rowLabel}>{t('updates.title')}</Text>
                      {hasUpdate(updates) ? <View testID="settings-update-badge" accessibilityLabel={t('updates.updateAvailableA11y')} style={styles.updateBadge} /> : null}
                      <Text numberOfLines={1} style={styles.value}>{t(updateSummaryKey(updates))}</Text>
                      <ChevronRight size={18} color={colors.subtle} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t('settings.preferences.account')}</Text>
                  <View style={styles.group}>
                    <Pressable accessibilityRole="button" onPress={() => { onClose(); void onLogout(); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                      <View style={styles.iconTile}><LogOut size={20} color={colors.errorText} /></View>
                      <Text style={[styles.rowLabel, { color: colors.errorText }]}>{t('app.account.logout')}</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : page === 'updates' ? <UpdateDetails colors={colors} updates={updates} /> : (
              <View style={styles.group}>
                {/* 选择后仍停留在详情页，受控值立即显示勾选；返回首页再显示最新摘要。
                    不添加保存按钮或另一份偏好状态，避免与父层持久化逻辑产生双写。 */}
                {(page === 'theme'
                  ? (['light', 'dark'] as const).map((theme) => ({ id: theme, label: t('settings.values.' + theme), checked: preferences.theme === theme, icon: theme === 'light' ? Sun : Moon, select: () => onChange({ ...preferences, theme }) }))
                  : supportedLocales.map((locale) => ({ id: locale.code, label: locale.nativeLabel, checked: preferences.language === locale.code, icon: null, select: () => onChange({ ...preferences, language: locale.code }) }))
                ).map((option, index) => (
                  <View key={option.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <Pressable accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: option.checked }} onPress={option.select} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                      {option.icon && <View style={styles.iconTile}><option.icon size={20} color={colors.foreground} /></View>}
                      <Text style={styles.rowLabel}>{option.label}</Text>
                      {option.checked && <Check size={20} color={colors.foreground} />}
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
