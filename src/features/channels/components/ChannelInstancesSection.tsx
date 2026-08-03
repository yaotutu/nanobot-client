import { ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import type { Palette } from '@/ui/palette';
import type { NanobotChannelInstanceInfo } from '@/types/api/channels';

import { ActionButton, Section, StatusBadge } from "./channel-controls";
import {
  channelCopy,
  instanceDisplayName,
  instanceRunning,
  instanceStatusLabel,
  maskFeishuAppId,
} from "./channels-utils";

interface ChannelInstancesSectionProps {
  actionKey: string | null;
  busy: boolean;
  colors: Palette;
  featureName: string;
  instanceId?: string;
  instances: NanobotChannelInstanceInfo[];
  onSelect: (instanceId: string) => void;
  onToggle: (enabled: boolean, instanceId: string) => Promise<void>;
}

export function ChannelInstancesSection({
  actionKey,
  busy,
  colors,
  featureName,
  instanceId,
  instances,
  onSelect,
  onToggle,
}: ChannelInstancesSectionProps) {
  const { t } = useTranslation();

  return (
    <Section
      colors={colors}
      title={
        featureName === "feishu"
          ? channelCopy(t, "assistants", "Assistants")
          : channelCopy(t, "instances", "Instances")
      }
    >
      <Text style={[styles.helper, { color: colors.muted }]}>
        {channelCopy(
          t,
          "instanceSummary",
          "{{configured}} configured · {{running}} running",
          {
            configured: instances.filter((item) => item.configured).length,
            running: instances.filter(instanceRunning).length,
          },
        )}
      </Text>
      <View style={styles.instanceList}>
        {instances.map((item) => {
          const selected = instanceId === item.id;
          const itemRunning = instanceRunning(item);
          const itemBusy = actionKey?.endsWith(`:${featureName}:${item.id}`) ?? false;
          return (
            <View
              key={item.id}
              style={[
                styles.instanceCard,
                {
                  backgroundColor: selected ? colors.pressed : colors.background,
                  borderColor: selected ? colors.foreground : colors.border,
                },
              ]}
            >
              <View style={styles.instanceCardHeader}>
                <Pressable
                  accessibilityLabel={channelCopy(
                    t,
                    "selectInstance",
                    "View {{name}} instance",
                    { name: instanceDisplayName(item) },
                  )}
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item.id)}
                  style={styles.instanceSelect}
                >
                  <View style={styles.instanceCopy}>
                    <Text
                      numberOfLines={1}
                      style={[styles.instanceName, { color: colors.foreground }]}
                    >
                      {instanceDisplayName(item)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.instanceSummary, { color: colors.muted }]}
                    >
                      {featureName === "feishu"
                        ? maskFeishuAppId(
                            item.config_values?.["channels.feishu.appId"],
                            t,
                          )
                        : item.id}
                    </Text>
                  </View>
                  <ChevronRight color={colors.muted} size={16} />
                </Pressable>
                {itemBusy ? (
                  <ActivityIndicator color={colors.muted} size="small" />
                ) : null}
                <Switch
                  accessibilityLabel={channelCopy(
                    t,
                    "toggleInstance",
                    "{{name}} instance",
                    { name: instanceDisplayName(item) },
                  )}
                  disabled={busy || !item.configured}
                  onValueChange={(value) => void onToggle(value, item.id)}
                  value={Boolean(itemRunning || item.runtime_status === "starting")}
                />
              </View>
              {selected ? (
                <View
                  style={[
                    styles.instanceExpanded,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <StatusBadge
                    colors={colors}
                    failed={item.runtime_status === "failed"}
                    running={itemRunning}
                    text={instanceStatusLabel(item, t)}
                  />
                  {featureName === "feishu" && item.configured ? (
                    <ActionButton
                      colors={colors}
                      disabled={busy || !item.enabled}
                      label={
                        itemBusy
                          ? channelCopy(t, "reconnecting", "Reconnecting…")
                          : channelCopy(t, "reconnect", "Reconnect")
                      }
                      onPress={() => void onToggle(true, item.id)}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  helper: { fontSize: 11.5, lineHeight: 17 },
  instanceList: { gap: 8 },
  instanceCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
  },
  instanceCardHeader: {
    minHeight: 62,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  instanceSelect: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  instanceCopy: { flex: 1, minWidth: 0 },
  instanceName: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  instanceSummary: {
    marginTop: 2,
    fontSize: 10.5,
    lineHeight: 15,
    fontFamily: "monospace",
  },
  instanceExpanded: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
});
