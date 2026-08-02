import { Check, ChevronDown } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import type { SettingsPalette } from '@/features/settings/types';

export interface SettingsOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function SettingsPage({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function SettingsSection({ colors, title, children }: {
  colors: SettingsPalette;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text selectable style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

export function SettingsRow({ colors, title, description, children, last = false }: {
  colors: SettingsPalette;
  title: string;
  description?: string;
  children?: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={styles.rowCopy}>
        <Text selectable style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
        {description ? <Text selectable style={[styles.rowDescription, { color: colors.subtle }]}>{description}</Text> : null}
      </View>
      {children ? <View style={styles.rowControl}>{children}</View> : null}
    </View>
  );
}

export function StatusPill({ colors, label, tone = 'neutral' }: {
  colors: SettingsPalette;
  label: string;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  const color = tone === 'success' ? '#2F8F61' : tone === 'warning' ? '#B7791F' : colors.muted;
  const backgroundColor = tone === 'success'
    ? 'rgba(47,143,97,0.11)'
    : tone === 'warning'
      ? 'rgba(183,121,31,0.12)'
      : colors.pressed;
  return <Text selectable style={[styles.pill, { color, backgroundColor }]}>{label}</Text>;
}

export function SettingsSwitch({ colors, value, onValueChange, disabled = false }: {
  colors: SettingsPalette;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Switch
      disabled={disabled}
      onValueChange={onValueChange}
      thumbColor={value ? colors.background : '#FFFFFF'}
      trackColor={{ false: colors.border, true: colors.foreground }}
      value={value}
    />
  );
}

export function SegmentedControl({ colors, value, options, onChange }: {
  colors: SettingsPalette;
  value: string;
  options: SettingsOption[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={[styles.segmented, { backgroundColor: colors.pressed }]}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: option.disabled }}
            disabled={option.disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: colors.background, borderColor: colors.border },
              pressed && { opacity: 0.72 },
              option.disabled && { opacity: 0.42 },
            ]}
          >
            <Text style={[styles.segmentLabel, { color: selected ? colors.foreground : colors.muted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsInput({ colors, style, ...props }: TextInputProps & { colors: SettingsPalette }) {
  return (
    <TextInput
      placeholderTextColor={colors.subtle}
      style={[
        styles.input,
        { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
        style,
      ]}
      {...props}
    />
  );
}

export function SettingsButton({ colors, label, onPress, disabled = false, primary = false }: {
  colors: SettingsPalette;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? colors.foreground : colors.background,
          borderColor: colors.border,
          opacity: disabled ? 0.42 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: primary ? colors.background : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function SettingsNotice({ colors, message, error = false }: {
  colors: SettingsPalette;
  message: string;
  error?: boolean;
}) {
  return (
    <View style={[styles.notice, { backgroundColor: error ? colors.errorBackground : colors.pressed }]}>
      <Text selectable style={[styles.noticeText, { color: error ? colors.errorText : colors.muted }]}>{message}</Text>
    </View>
  );
}

export function SettingsPicker({ colors, label, title, value, options, onChange, disabled = false }: {
  colors: SettingsPalette;
  label?: string;
  title: string;
  value: string;
  options: SettingsOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <>
      <Pressable
        accessibilityLabel={label ?? title}
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.pickerButton,
          { backgroundColor: colors.background, borderColor: colors.border },
          pressed && { opacity: 0.72 },
          disabled && { opacity: 0.45 },
        ]}
      >
        <Text numberOfLines={1} style={[styles.pickerLabel, { color: colors.foreground }]}>
          {selected?.label ?? (value || t('settings.models.selectModel'))}
        </Text>
        <ChevronDown color={colors.muted} size={14} />
      </Pressable>
      {open ? (
        <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent>
          <Pressable onPress={() => setOpen(false)} style={styles.modalBackdrop}>
            <Pressable onPress={(event) => event.stopPropagation()} style={[styles.sheet, { backgroundColor: colors.background }]}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
              <Text selectable style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text>
              <ScrollView contentContainerStyle={styles.optionList} keyboardShouldPersistTaps="handled">
                {options.map((option) => {
                  const active = option.value === value;
                  return (
                    <Pressable
                      disabled={option.disabled}
                      key={option.value}
                      onPress={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.option,
                        { backgroundColor: active ? colors.pressed : 'transparent' },
                        pressed && { opacity: 0.68 },
                        option.disabled && { opacity: 0.4 },
                      ]}
                    >
                      <View style={styles.optionCopy}>
                        <Text style={[styles.optionLabel, { color: colors.foreground }]}>{option.label}</Text>
                        {option.description ? <Text style={[styles.optionDescription, { color: colors.subtle }]}>{option.description}</Text> : null}
                      </View>
                      {active ? <Check color={colors.foreground} size={17} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <SettingsButton colors={colors} label={t('settings.actions.cancel')} onPress={() => setOpen(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 40, gap: 23 },
  section: { gap: 8 },
  sectionTitle: { paddingHorizontal: 3, fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 68, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowControl: { maxWidth: '58%', alignItems: 'flex-end' },
  rowTitle: { fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
  rowDescription: { fontSize: 11.5, lineHeight: 16 },
  pill: { borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, fontSize: 11.5, fontWeight: '700' },
  segmented: { borderRadius: 999, flexDirection: 'row', padding: 2 },
  segment: { minHeight: 29, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { fontSize: 11.5, fontWeight: '700' },
  input: { minHeight: 42, width: '100%', borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, paddingVertical: 8, fontSize: 13 },
  button: { minHeight: 39, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontSize: 12.5, fontWeight: '700' },
  notice: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  noticeText: { fontSize: 12, lineHeight: 18 },
  pickerButton: { minHeight: 38, minWidth: 132, maxWidth: 220, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  pickerLabel: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.34)' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, gap: 12 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3, marginBottom: 4 },
  sheetTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  optionList: { paddingVertical: 4, gap: 2 },
  option: { minHeight: 54, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionCopy: { flex: 1, minWidth: 0 },
  optionLabel: { fontSize: 13.5, fontWeight: '600' },
  optionDescription: { marginTop: 2, fontSize: 11.5, lineHeight: 16 },
});
