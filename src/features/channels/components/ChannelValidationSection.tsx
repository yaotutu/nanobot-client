import { Check, CircleAlert, ExternalLink, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SettingsPalette } from "@/features/settings/types";
import type { ChannelValidationPayload } from '@/types/api/channels';

import { Section } from "./channel-controls";
import { channelCopy } from "./channels-utils";

interface ChannelValidationSectionProps {
  colors: SettingsPalette;
  onOpenUrl: (url: string) => Promise<void>;
  validation: ChannelValidationPayload;
}

export function ChannelValidationSection({
  colors,
  onOpenUrl,
  validation,
}: ChannelValidationSectionProps) {
  const { t } = useTranslation();
  const successful =
    validation.status === "connected" || validation.status === "configured";

  return (
    <Section
      colors={colors}
      title={channelCopy(t, "validationResult", "Validation result")}
    >
      <View style={styles.validationTitle}>
        {successful ? (
          <Check color="#16865C" size={17} />
        ) : (
          <CircleAlert
            color={validation.status === "invalid" ? colors.errorText : "#B27818"}
            size={17}
          />
        )}
        <Text style={[styles.validationStatus, { color: colors.foreground }]}>
          {validation.message || validation.status}
        </Text>
      </View>
      {validation.identity ? (
        <Text style={[styles.helper, { color: colors.muted }]}>
          {[
            validation.identity.name,
            validation.identity.workspace,
            validation.identity.account,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ) : null}
      {validation.checks.map((check) => (
        <View key={check.id} style={styles.checkRow}>
          {check.status === "pass" ? (
            <Check color="#16865C" size={15} />
          ) : check.status === "fail" ? (
            <X color={colors.errorText} size={15} />
          ) : (
            <CircleAlert color="#B27818" size={15} />
          )}
          <View style={styles.checkCopy}>
            <Text style={[styles.checkLabel, { color: colors.foreground }]}>
              {check.label}
            </Text>
            {check.message ? (
              <Text style={[styles.checkMessage, { color: colors.muted }]}>
                {check.message}
              </Text>
            ) : null}
            {check.action_url ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void onOpenUrl(check.action_url!)}
                style={styles.validationLink}
              >
                <ExternalLink color={colors.muted} size={13} />
                <Text
                  style={[styles.validationLinkText, { color: colors.muted }]}
                >
                  {channelCopy(t, "open", "Open")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  helper: { fontSize: 12.5, lineHeight: 19 },
  validationTitle: { flexDirection: "row", alignItems: "center", gap: 7 },
  validationStatus: { flex: 1, fontSize: 13, fontWeight: "700" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  checkCopy: { flex: 1, gap: 2 },
  checkLabel: { fontSize: 12.5, fontWeight: "600" },
  checkMessage: { fontSize: 11.5, lineHeight: 17 },
  validationLink: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  validationLinkText: { fontSize: 11.5, fontWeight: "600" },
});
