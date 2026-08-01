import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SettingsPalette } from "../../screens/settings-screen";

export function Section({
  colors,
  title,
  children,
}: {
  colors: SettingsPalette;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>
        {title}
      </Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
        {children}
      </View>
    </View>
  );
}

export function ActionButton({
  colors,
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  colors: SettingsPalette;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: primary ? colors.foreground : colors.background,
          borderColor: colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          { color: primary ? colors.background : colors.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function StatusBadge({
  colors,
  running,
  failed,
  text,
}: {
  colors: SettingsPalette;
  running: boolean;
  failed: boolean;
  text: string;
}) {
  const background = failed
    ? colors.errorBackground
    : running
      ? "#E6F5EE"
      : colors.background;
  const color = failed ? colors.errorText : running ? "#16865C" : colors.muted;
  return (
    <View style={[styles.statusBadge, { backgroundColor: background }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 8 },
  sectionTitle: { paddingHorizontal: 3, fontSize: 12, fontWeight: "600" },
  sectionCard: { borderRadius: 20, padding: 14, gap: 13 },
  actionButton: {
    minHeight: 39,
    minWidth: 90,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: { fontSize: 12.5, fontWeight: "700" },
  statusBadge: {
    minHeight: 25,
    borderRadius: 13,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10.5, fontWeight: "700" },
});
