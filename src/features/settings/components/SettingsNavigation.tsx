import {
  Bot,
  Globe2,
  Image as ImageIcon,
  LayoutDashboard,
  MessageCircle,
  Mic,
  Palette as PaletteIcon,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { SettingsSectionKey } from '@/features/settings/types';
import type { Palette } from '@/ui/palette';

const SECTIONS = [
  { key: 'overview' as const, translationKey: 'overview', icon: LayoutDashboard },
  { key: 'appearance' as const, translationKey: 'appearance', icon: PaletteIcon },
  { key: 'models' as const, translationKey: 'models', icon: Bot },
  { key: 'image' as const, translationKey: 'image', icon: ImageIcon },
  { key: 'voice' as const, translationKey: 'voice', icon: Mic },
  { key: 'web' as const, translationKey: 'browser', icon: Globe2 },
  { key: 'channels' as const, translationKey: 'channels', icon: MessageCircle },
  { key: 'runtime' as const, translationKey: 'runtime', icon: Server },
  { key: 'security' as const, translationKey: 'advanced', icon: ShieldCheck },
];

interface SettingsNavigationProps {
  colors: Palette;
  onRefresh: () => void;
  onSelect: (section: SettingsSectionKey) => void;
  refreshing: boolean;
  section: SettingsSectionKey;
}

export function SettingsNavigation({
  colors,
  onRefresh,
  onSelect,
  refreshing,
  section,
}: SettingsNavigationProps) {
  const { t } = useTranslation();
  return (
    <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
      <ScrollView
        contentContainerStyle={styles.navContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {SECTIONS.map(({ key, translationKey, icon: Icon }) => {
          const active = section === key;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={key}
              onPress={() => onSelect(key)}
              style={({ pressed }) => [
                styles.navItem,
                {
                  backgroundColor: active
                    ? colors.foreground
                    : pressed
                      ? colors.pressed
                      : colors.card,
                },
              ]}
            >
              <Icon
                color={active ? colors.background : colors.muted}
                size={15}
                strokeWidth={1.9}
              />
              <Text style={[styles.navText, { color: active ? colors.background : colors.muted }]}>
                {t(`settings.nav.${translationKey}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityLabel={t('settings.channels.checkConnection')}
        disabled={refreshing}
        onPress={onRefresh}
        style={styles.refreshButton}
      >
        {refreshing ? (
          <ActivityIndicator color={colors.muted} size="small" />
        ) : (
          <RefreshCw color={colors.muted} size={16} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    minHeight: 55,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navContent: { paddingHorizontal: 12, paddingVertical: 9, gap: 7 },
  navItem: {
    minHeight: 35,
    borderRadius: 18,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navText: { fontSize: 11.5, fontWeight: '700' },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 3,
  },
});
