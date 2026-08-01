import { Bot } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SettingsPalette } from '../../settings-screen';

export function ProviderMark({ colors, label, showBrandLogos }: {
  colors: SettingsPalette;
  label: string;
  showBrandLogos: boolean;
}) {
  return (
    <View style={[styles.providerMark, { backgroundColor: colors.pressed }]}>
      {showBrandLogos ? (
        <Text style={[styles.providerInitial, { color: colors.foreground }]}>{label.slice(0, 2).toUpperCase()}</Text>
      ) : (
        <Bot color={colors.muted} size={15} />
      )}
    </View>
  );
}

export function IconButton({ colors, label, disabled = false, onPress, children }: {
  colors: SettingsPalette;
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: colors.background, borderColor: colors.border },
        { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function FieldLabel({ colors, children }: { colors: SettingsPalette; children: React.ReactNode }) {
  return <Text style={[styles.fieldLabel, { color: colors.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  iconButton: { width: 36, height: 36, flexShrink: 0, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  providerInitial: { fontSize: 8.5, fontWeight: '800' },
  providerMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
