import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CliAppInfo } from '@/types/api';
import type { Palette } from '@/ui/palette';

import { ToolLogo } from './AppsShared';

export function CliReadyPanel({
  app,
  colors,
  onBackToChat,
}: {
  app: CliAppInfo;
  colors: Palette;
  onBackToChat: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const prompt = t('settings.cliApps.readyPrompt', { name: app.name });
  const copyPrompt = async () => {
    await Clipboard.setStringAsync(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_400);
  };
  return (
    <View style={[styles.readyPanel, { backgroundColor: colors.card }]}>
      <ToolLogo
        brandColor={app.brand_color}
        colors={colors}
        displayName={app.display_name}
        hideGenericRepositoryLogo
        logoUrl={app.logo_url}
      />
      <View style={styles.readyPanelCopy}>
        <View style={styles.readyPanelTitleRow}>
          <Text numberOfLines={1} style={[styles.readyPanelTitle, { color: colors.foreground }]}>{app.display_name}</Text>
          <View style={[styles.readyBadge, { backgroundColor: colors.background }]}>
            <Check color="#4F8A62" size={12} strokeWidth={2} />
            <Text style={[styles.readyBadgeText, { color: colors.muted }]}>{t('settings.cliApps.readyStatus')}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={[styles.readyPanelMeta, { color: colors.muted }]}>@{app.name} · {app.entry_point || app.name} · {app.category}</Text>
      </View>
      <View style={styles.readyPanelActions}>
        <Pressable
          accessibilityLabel={t('settings.cliApps.readyTry', { name: app.name })}
          onPress={() => void copyPrompt()}
          style={[styles.readyAction, { borderColor: colors.border }]}
        >
          {copied ? <Check color={colors.muted} size={13} /> : <Copy color={colors.muted} size={13} />}
          <Text style={[styles.readyActionText, { color: colors.muted }]}>{copied ? t('settings.cliApps.readyCopied') : t('settings.cliApps.readyTry', { name: app.name })}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={t('settings.cliApps.openChat')}
          onPress={onBackToChat}
          style={[styles.readyAction, { backgroundColor: colors.foreground, borderColor: colors.foreground }]}
        >
          <Text style={[styles.readyActionText, { color: colors.background }]}>{t('settings.cliApps.openChat')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readyPanel: { marginTop: 10, borderRadius: 14, padding: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  readyPanelCopy: { flex: 1, minWidth: 170 },
  readyPanelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  readyPanelTitle: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  readyBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  readyBadgeText: { fontSize: 10, fontWeight: '600' },
  readyPanelMeta: { marginTop: 3, fontSize: 11.5, lineHeight: 17 },
  readyPanelActions: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', gap: 7 },
  readyAction: { minHeight: 34, borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  readyActionText: { fontSize: 11.5, fontWeight: '700' },
});
