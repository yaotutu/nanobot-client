import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import X from 'lucide-react-native/icons/x';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ModelPresetInfo } from '@/types/api/settings';

interface ModelPresetPalette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
}

interface ModelPresetMenuProps {
  activePreset: string;
  colors: ModelPresetPalette;
  disabled?: boolean;
  displayLabel: string;
  onOpenSettings: () => void;
  onPresetChange: (name: string) => Promise<void>;
  presets: ModelPresetInfo[];
}

export function ModelPresetMenu({
  activePreset,
  colors,
  disabled = false,
  displayLabel,
  onOpenSettings,
  onPresetChange,
  presets,
}: ModelPresetMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const options = useMemo(() => {
    const order = new Map(presets.map((preset, index) => [preset.name, index]));
    return presets
      .filter((preset) => !preset.is_default && preset.name.trim())
      .sort((left, right) => (order.get(left.name) ?? 0) - (order.get(right.name) ?? 0));
  }, [presets]);

  const handleBadgePress = () => {
    if (disabled) return;
    if (!options.length) {
      onOpenSettings();
      return;
    }
    setOpen(true);
  };

  const choose = async (name: string) => {
    if (pending || name === activePreset) {
      if (name === activePreset) setOpen(false);
      return;
    }
    setPending(name);
    try {
      await onPresetChange(name);
      setOpen(false);
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <Pressable
        accessibilityLabel={`${t('settings.rows.currentModel')}: ${displayLabel}`}
        disabled={disabled}
        onPress={handleBadgePress}
        style={({ pressed }) => [
          styles.badge,
          { backgroundColor: colors.pressed },
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Text numberOfLines={1} style={[styles.badgeText, { color: colors.muted }]}>{displayLabel}</Text>
        <ChevronDown color={colors.subtle} size={12} strokeWidth={2} />
      </Pressable>

      <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel={t('common.dismiss')} onPress={() => setOpen(false)} style={styles.backdrop} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>{t('settings.models.selectModel')}</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>{t('settings.help.currentModel')}</Text>
              </View>
              <Pressable accessibilityLabel={t('common.dismiss')} hitSlop={8} onPress={() => setOpen(false)} style={styles.closeButton}>
                <X color={colors.muted} size={18} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {options.map((preset) => {
                const selected = preset.name === activePreset;
                const loading = pending === preset.name;
                const provider = preset.resolved_provider || preset.provider;
                return (
                  <Pressable
                    accessibilityLabel={`${t('settings.rows.selectedPreset')}: ${preset.label || preset.name}`}
                    disabled={Boolean(pending)}
                    key={preset.name}
                    onPress={() => void choose(preset.name)}
                    style={({ pressed }) => [
                      styles.row,
                      { borderColor: selected ? colors.foreground : colors.border },
                      selected ? { backgroundColor: colors.pressed } : null,
                      pressed && !pending ? styles.pressed : null,
                    ]}
                  >
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{preset.label || preset.name}</Text>
                      <Text numberOfLines={1} style={[styles.rowDetail, { color: colors.muted }]}>
                        {[provider, preset.model].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {loading
                      ? <ActivityIndicator color={colors.muted} size="small" />
                      : selected
                        ? <Check color={colors.foreground} size={18} strokeWidth={2.2} />
                        : null}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
                style={({ pressed }) => [styles.settingsRow, pressed ? { backgroundColor: colors.pressed } : null]}
              >
                <Text style={[styles.settingsText, { color: colors.muted }]}>{t('settings.nav.models')}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    maxWidth: 154,
    height: 31,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badgeText: { minWidth: 0, flexShrink: 1, fontSize: 11.5, fontWeight: '600' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    minHeight: 66,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 18,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { marginTop: 2, fontSize: 11.5 },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12, paddingBottom: 24, gap: 8 },
  row: {
    minHeight: 62,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowBody: { minWidth: 0, flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowDetail: { marginTop: 3, fontSize: 11.5 },
  settingsRow: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontSize: 12.5, fontWeight: '600' },
});
