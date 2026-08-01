import {
  ChevronRight,
  CircleAlert,
  RefreshCw,
  Search,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  fetchNanobotFeatures,
  setNanobotFeatureEnabled,
} from "@/features/channels/api";
import { channelPresentation } from "@/features/channels/channel-presentation";
import { currentLocale } from "@/i18n";
import type {
  NanobotFeatureInfo,
  NanobotFeaturesPayload,
} from "@/types/api";
import type { SettingsPalette } from "../screens/settings-screen";

import {
  type ChannelFilter,
  channelCopy,
  channelRunning,
  featureSearchText,
  statusLabel,
} from "./channels/channels-utils";
import { ChannelDetail } from "./channels/ChannelDetail";
import { ChannelMark } from "./channels/ChannelMark";
import { StatusBadge } from "./channels/channel-controls";

export function ChannelsSettings({
  colors,
  showBrandLogos,
}: {
  colors: SettingsPalette;
  showBrandLogos: boolean;
}) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<NanobotFeaturesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChannelFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "silent" = "initial") => {
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      try {
        const next = await fetchNanobotFeatures();
        setPayload(next);
        setError(null);
      } catch (caught) {
        if (mode !== "silent") {
          setError(
            caught instanceof Error
              ? caught.message
              : channelCopy(t, "loadFailed", "Could not load channels."),
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetchNanobotFeatures()
        .then((next) => {
          if (!cancelled) {
            setPayload(next);
            setError(null);
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(
              caught instanceof Error
                ? caught.message
                : channelCopy(t, "loadFailed", "Could not load channels."),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    refresh();
    const timer = setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [t]);

  const allChannels = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(currentLocale());
    return (payload?.features ?? [])
      .filter(
        (feature) =>
          feature.type === "channel" && feature.settings_visible !== false,
      )
      .filter(
        (feature) => !needle || featureSearchText(feature, t).includes(needle),
      )
      .sort(
        (left, right) =>
          Number(!left.ready) - Number(!right.ready) ||
          (left.display_name || left.name).localeCompare(
            right.display_name || right.name,
          ),
      );
  }, [payload, query, t]);
  const enabledCount = allChannels.filter(channelRunning).length;
  const channels = allChannels.filter(
    (feature) =>
      filter === "all" ||
      (filter === "on" ? channelRunning(feature) : !channelRunning(feature)),
  );
  const selectedFeature =
    (payload?.features ?? []).find((feature) => feature.name === selected) ??
    null;

  const toggle = async (
    feature: NanobotFeatureInfo,
    enabled: boolean,
    instanceId?: string,
  ) => {
    const key = `${enabled ? "enable" : "disable"}:${feature.name}:${instanceId ?? "default"}`;
    setActionKey(key);
    try {
      const next = await setNanobotFeatureEnabled(enabled ? "enable" : "disable",
        feature.name,
        instanceId,
      );
      setPayload(next);
      setError(
        next.last_action?.ok === false ? next.last_action.message : null,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : channelCopy(t, "actionFailed", "Channel action failed."),
      );
    } finally {
      setActionKey(null);
    }
  };

  if (selectedFeature) {
    return (
      <ChannelDetail
        actionKey={actionKey}
        colors={colors}
        feature={selectedFeature}
        onBack={() => setSelected(null)}
        onError={setError}
        onPayload={setPayload}
        showBrandLogos={showBrandLogos}
        onToggle={toggle}
        
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          colors={[colors.muted]}
          onRefresh={() => void load("refresh")}
          refreshing={refreshing}
          tintColor={colors.muted}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.summary}>
        <Text style={[styles.description, { color: colors.muted }]}>
          {channelCopy(
            t,
            "description",
            "Connect chat apps, email, and WebUI to nanobot.",
          )}
        </Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          {channelCopy(
            t,
            "caption",
            "{{enabled}} running · {{total}} channels",
            {
              enabled: enabledCount,
              total: allChannels.length,
            },
          )}
        </Text>
      </View>
      <View
        style={[
          styles.searchBox,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Search color={colors.muted} size={16} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setQuery}
          placeholder={channelCopy(t, "searchPlaceholder", "Search channels")}
          placeholderTextColor={colors.subtle}
          style={[styles.searchInput, { color: colors.foreground }]}
          value={query}
        />
        {query ? (
          <Pressable
            accessibilityLabel={channelCopy(t, "clearSearch", "Clear search")}
            onPress={() => setQuery("")}
          >
            <X color={colors.muted} size={16} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.filters}>
        {(
          [
            [
              "all",
              `${channelCopy(t, "filterAll", "All")} ${allChannels.length}`,
            ],
            ["on", `${channelCopy(t, "filterOn", "Running")} ${enabledCount}`],
            [
              "off",
              `${channelCopy(t, "filterOff", "Not running")} ${Math.max(
                0,
                allChannels.length - enabledCount,
              )}`,
            ],
          ] as Array<[ChannelFilter, string]>
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            style={[
              styles.filter,
              {
                backgroundColor:
                  filter === value ? colors.foreground : colors.card,
              },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === value ? colors.background : colors.muted },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityLabel={channelCopy(t, "refresh", "Refresh channels")}
          onPress={() => void load("refresh")}
          style={styles.refreshButton}
        >
          {refreshing ? (
            <ActivityIndicator color={colors.muted} size="small" />
          ) : (
            <RefreshCw color={colors.muted} size={16} />
          )}
        </Pressable>
      </View>
      {error ? (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: colors.errorBackground },
          ]}
        >
          <CircleAlert color={colors.errorText} size={16} />
          <Text style={[styles.errorText, { color: colors.errorText }]}>
            {error}
          </Text>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.muted} />
          <Text style={{ color: colors.muted }}>
            {channelCopy(t, "loading", "Loading Channels...")}
          </Text>
        </View>
      ) : channels.length === 0 ? (
        <View style={styles.loading}>
          <Text style={{ color: colors.muted }}>
            {channelCopy(t, "empty", "No channels match this filter.")}
          </Text>
        </View>
      ) : (
        <View style={[styles.catalog, { backgroundColor: colors.card }]}>
          {channels.map((feature, index) => {
            const presentation = channelPresentation(feature);
            return (
              <Pressable
                accessibilityLabel={channelCopy(
                  t,
                  "selectChannel",
                  "View {{name}} settings",
                  { name: presentation.displayName },
                )}
                key={feature.name}
                onPress={() => setSelected(feature.name)}
                style={({ pressed }) => [
                  styles.channelRow,
                  index > 0 && {
                    borderTopColor: colors.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                  },
                  pressed && { backgroundColor: colors.pressed },
                ]}
              >
                <View
                  style={[
                    styles.channelIcon,
                    { backgroundColor: `${presentation.color}18` },
                  ]}
                >
                  <ChannelMark
                    presentation={presentation}
                    showBrandLogos={showBrandLogos}
                    size="small"
                  />
                </View>
                <View style={styles.channelCopy}>
                  <Text
                    numberOfLines={1}
                    style={[styles.channelName, { color: colors.foreground }]}
                  >
                    {presentation.displayName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.channelMeta, { color: colors.muted }]}
                  >
                    {presentation.description ??
                      `${
                        feature.configured
                          ? channelCopy(t, "instanceConfigured", "Configured")
                          : channelCopy(t, "instanceNeedsSetup", "Needs setup")
                      } · ${
                        feature.installed
                          ? channelCopy(t, "installed", "Installed")
                          : channelCopy(t, "notInstalled", "Not installed")
                      }`}
                  </Text>
                </View>
                <StatusBadge
                  colors={colors}
                  failed={feature.runtime_status === "failed"}
                  running={channelRunning(feature)}
                  text={statusLabel(feature, t)}
                />
                <ChevronRight color={colors.subtle} size={17} />
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 32 },
  summary: { gap: 5, marginBottom: 15 },
  description: { fontSize: 13, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: "600" },
  searchBox: {
    height: 43,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, height: 42, fontSize: 14, paddingVertical: 0 },
  filters: {
    marginTop: 11,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    alignItems: "center",
  },
  filter: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  filterText: { fontSize: 11.5, fontWeight: "700" },
  refreshButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBanner: {
    marginTop: 12,
    borderRadius: 14,
    padding: 11,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  loading: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  catalog: {
    marginTop: 13,
    borderRadius: 20,
    overflow: "hidden",
    paddingHorizontal: 8,
  },
  channelRow: {
    minHeight: 78,
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  channelIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  channelCopy: { flex: 1, minWidth: 0 },
  channelName: { fontSize: 14, fontWeight: "700" },
  channelMeta: { marginTop: 3, fontSize: 11.5 },
});
