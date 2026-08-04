import type { TFunction } from 'i18next';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Search from 'lucide-react-native/icons/search';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SettingsButton } from '@/features/settings/components/settings-controls';
import type { Palette } from '@/ui/palette';

interface TimezoneOption {
  name: string;
  offset: string;
  searchText: string;
}

const FALLBACK_TIMEZONES = [
  'UTC', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Seoul',
  'Asia/Singapore', 'Asia/Taipei', 'Asia/Dubai', 'Asia/Kolkata',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland',
];

function timezoneOffset(timezone: string, t: TFunction): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date());
    const value = parts.find((part) => part.type === 'timeZoneName')?.value;
    return value ? value.replace(/^GMT$/, 'UTC').replace(/^GMT/, 'UTC') : 'UTC';
  } catch {
    return t('settings.timezone.custom', { defaultValue: 'Custom timezone' });
  }
}

function timezoneOptions(current: string, t: TFunction): TimezoneOption[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  let supported: string[];
  try {
    supported = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    supported = [];
  }
  const names = Array.from(new Set([...FALLBACK_TIMEZONES, ...supported, current].filter(Boolean)))
    .sort((left, right) => {
      if (left === 'UTC') return -1;
      if (right === 'UTC') return 1;
      return left.localeCompare(right);
    });
  return names.map((name) => {
    const offset = timezoneOffset(name, t);
    return {
      name,
      offset,
      searchText: `${name} ${name.replace(/_/g, ' ')} ${offset}`.toLowerCase(),
    };
  });
}

export function TimezonePicker({ colors, value, onChange }: {
  colors: Palette;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const options = useMemo(() => timezoneOptions(value, t), [t, value]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? options.filter((option) => option.searchText.includes(normalized)) : options;
  }, [options, query]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.timezoneButton, { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}
      >
        <Text numberOfLines={1} style={[styles.timezoneValue, { color: colors.foreground }]}>{value || t('settings.timezone.select')}</Text>
        <ChevronDown color={colors.muted} size={14} />
      </Pressable>
      <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable onPress={() => setOpen(false)} style={styles.modalBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.timezoneSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t('settings.timezone.select')}</Text>
            <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Search color={colors.muted} size={16} />
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setQuery} placeholder={t('settings.timezone.search')} placeholderTextColor={colors.subtle} style={[styles.searchInput, { color: colors.foreground }]} value={query} />
            </View>
            <ScrollView contentContainerStyle={styles.timezoneList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {filtered.length ? filtered.map((option) => {
                const selected = option.name === value;
                return (
                  <Pressable
                    key={option.name}
                    onPress={() => {
                      onChange(option.name);
                      setQuery('');
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.timezoneOption, { backgroundColor: selected ? colors.pressed : pressed ? colors.card : 'transparent' }]}
                  >
                    <Text numberOfLines={1} style={[styles.timezoneName, { color: colors.foreground }]}>{option.name}</Text>
                    <Text style={[styles.timezoneOffset, { color: colors.muted }]}>{option.offset}</Text>
                    {selected ? <Check color={colors.foreground} size={17} /> : null}
                  </Pressable>
                );
              }) : <Text style={[styles.emptyTimezone, { color: colors.muted }]}>{t('settings.timezone.empty')}</Text>}
            </ScrollView>
            <SettingsButton colors={colors} label={t('settings.actions.cancel')} onPress={() => { setQuery(''); setOpen(false); }} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  timezoneButton: { minHeight: 38, width: 210, maxWidth: '100%', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  timezoneValue: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.34)' },
  timezoneSheet: { height: '82%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, gap: 12 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3, marginBottom: 4 },
  sheetTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  searchWrap: { minHeight: 42, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minHeight: 40, paddingVertical: 0, fontSize: 13 },
  timezoneList: { paddingVertical: 2 },
  timezoneOption: { minHeight: 50, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  timezoneName: { flex: 1, fontSize: 13, fontWeight: '600' },
  timezoneOffset: { fontSize: 11.5, fontWeight: '600' },
  emptyTimezone: { paddingVertical: 28, textAlign: 'center', fontSize: 12.5 },
});
