import { Eye, EyeOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { channelCopy } from "./channels-utils";
import type { ChannelConfigField } from "@/types/api";
import type { SettingsPalette } from "../../screens/settings-screen";

export function ChannelFields({
  colors,
  fields,
  values,
  configuredFields,
  touched,
  visibleSecrets,
  onChange,
  onToggleSecret,
}: {
  colors: SettingsPalette;
  fields: ChannelConfigField[];
  values: Record<string, string>;
  configuredFields: Set<string>;
  touched: Set<string>;
  visibleSecrets: Set<string>;
  onChange: (key: string, value: string) => void;
  onToggleSecret: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.fieldList}>
      {fields.map((field) => {
        const secret = Boolean(field.secret);
        const booleanField =
          field.options?.length === 2 &&
          field.options.some((option) => option.value === "true") &&
          field.options.some((option) => option.value === "false");
        const configured = configuredFields.has(field.key);
        const value =
          values[field.key] ??
          field.defaultValue ??
          field.options?.[0]?.value ??
          "";
        return (
          <View key={field.key} style={styles.field}>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                {field.label}
                {field.optional
                  ? ` (${channelCopy(t, "optional", "Optional")})`
                  : " *"}
              </Text>
              {configured && !touched.has(field.key) ? (
                <Text style={[styles.configuredText, { color: colors.muted }]}>
                  {channelCopy(t, "savedSecret", "Saved")}
                </Text>
              ) : null}
            </View>
            {booleanField ? (
              <View style={[styles.boolRow, { borderColor: colors.border }]}>
                <Text style={{ color: colors.muted }}>
                  {field.options?.find((option) => option.value === value)
                    ?.label ??
                    (value === "true"
                      ? channelCopy(t, "enabled", "Enabled")
                      : channelCopy(t, "filterOff", "Not running"))}
                </Text>
                <Switch
                  onValueChange={(next) => onChange(field.key, String(next))}
                  trackColor={{ true: colors.foreground }}
                  value={value === "true"}
                />
              </View>
            ) : field.options?.length ? (
              <View style={styles.choiceRow}>
                {field.options.map((option) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: value === option.value }}
                    key={option.value}
                    onPress={() => onChange(field.key, option.value)}
                    style={[
                      styles.choice,
                      {
                        backgroundColor:
                          value === option.value
                            ? colors.foreground
                            : colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        {
                          color:
                            value === option.value
                              ? colors.background
                              : colors.muted,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View
                style={[
                  styles.inputWrap,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              >
                <TextInput
                  autoCapitalize="none"
                  keyboardType={
                    field.inputType === "number" ? "number-pad" : "default"
                  }
                  onChangeText={(next) => onChange(field.key, next)}
                  placeholder={
                    secret && configured
                      ? channelCopy(t, "savedSecretPlaceholder", "Saved secret")
                      : (field.placeholder ?? field.defaultValue)
                  }
                  placeholderTextColor={colors.subtle}
                  secureTextEntry={secret && !visibleSecrets.has(field.key)}
                  style={[styles.input, { color: colors.foreground }]}
                  value={values[field.key] ?? ""}
                />
                {secret && (value.trim() || configured) ? (
                  <Pressable
                    accessibilityLabel={
                      visibleSecrets.has(field.key)
                        ? channelCopy(t, "hideSecret", "Hide secret")
                        : channelCopy(t, "showSecret", "Show secret")
                    }
                    onPress={() => onToggleSecret(field.key)}
                  >
                    {visibleSecrets.has(field.key) ? (
                      <EyeOff color={colors.muted} size={17} />
                    ) : (
                      <Eye color={colors.muted} size={17} />
                    )}
                  </Pressable>
                ) : null}
              </View>
            )}
            {field.help ? (
              <Text style={[styles.fieldHelp, { color: colors.muted }]}>
                {field.help}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldList: { gap: 13 },
  field: { gap: 7 },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  fieldLabel: { flex: 1, fontSize: 12.5, fontWeight: "600" },
  configuredText: { fontSize: 10.5 },
  fieldHelp: { fontSize: 11.5, lineHeight: 17 },
  inputWrap: {
    minHeight: 43,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: { flex: 1, minHeight: 42, paddingVertical: 0, fontSize: 13 },
  boolRow: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: {
    minHeight: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: { fontSize: 11.5, fontWeight: "600" },
});
