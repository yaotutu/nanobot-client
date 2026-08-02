import { Check, Plus, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { CliAppInfo } from '@/types/api/capabilities';
import type { Palette } from '@/ui/palette';

import type { AppAction } from './apps-utils';
import { ToolLogo, TypeBadge } from './AppsShared';

export function CliAppRow({
  app,
  colors,
  actionKey,
  onAction,
}: {
  app: CliAppInfo;
  colors: Palette;
  actionKey: string | null;
  onAction: (action: AppAction, app: CliAppInfo) => void;
}) {
  const { t } = useTranslation();
  const busy = Boolean(actionKey?.endsWith(`:cli:${app.name}`));
  const description = app.description || app.requires || app.entry_point || app.name;
  const showMenu = () => {
    Alert.alert(app.display_name, description, [
      { text: t('settings.actions.cancel'), style: 'cancel' },
      { text: t('settings.mcp.test'), onPress: () => onAction('test', app) },
      { text: t('settings.cliApps.update'), onPress: () => onAction('update', app) },
      { text: t('settings.cliApps.uninstall'), style: 'destructive', onPress: () => onAction('uninstall', app) },
    ]);
  };
  return (
    <View style={[styles.toolRow, { borderBottomColor: colors.border }]}>
      <ToolLogo
        brandColor={app.brand_color}
        colors={colors}
        displayName={app.display_name}
        hideGenericRepositoryLogo
        logoUrl={app.logo_url}
      />
      <View style={styles.toolCopy}>
        <View style={styles.toolTitleRow}>
          <Text numberOfLines={1} style={[styles.toolTitle, { color: colors.foreground }]}>{app.display_name}</Text>
          <TypeBadge colors={colors} label={t('settings.apps.cliLabel', { defaultValue: 'App' })} />
        </View>
        <Text numberOfLines={1} style={[styles.toolDescription, { color: colors.muted }]}>{description}</Text>
      </View>
      {busy ? <ActivityIndicator color={colors.muted} size="small" /> : app.installed ? (
        <View style={styles.rowActions}>
          <Pressable accessibilityLabel={t('settings.cliApps.statusInstalled')} onPress={showMenu} style={[styles.actionButton, { backgroundColor: colors.card }]}>
            <Check color="#4F8A62" size={17} strokeWidth={2} />
          </Pressable>
          <Pressable accessibilityLabel={t('settings.cliApps.uninstall')} onPress={() => onAction('uninstall', app)} style={styles.actionButton}>
            <Trash2 color={colors.errorText} size={16} strokeWidth={1.8} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityLabel={app.install_supported ? t('settings.cliApps.install') : t('settings.cliApps.unavailable')}
          disabled={!app.install_supported}
          onPress={() => onAction('install', app)}
          style={[styles.actionButton, { opacity: app.install_supported ? 1 : 0.38 }]}
        >
          <Plus color={colors.muted} size={18} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toolRow: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 3, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  toolCopy: { flex: 1, minWidth: 0 },
  toolTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  toolTitle: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  toolDescription: { marginTop: 2, fontSize: 12.5, lineHeight: 18 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  actionButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
