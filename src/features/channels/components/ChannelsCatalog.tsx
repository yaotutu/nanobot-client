import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
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
  type ChannelFilter,
  channelCopy,
  channelRunning,
  statusLabel,
} from '@/features/channels/model';
import { channelPresentation } from '@/features/channels/presentation/channel-presentation';
import type {
  NanobotFeatureInfo,
  NanobotFeaturesPayload,
} from '@/types/api/nanobot-features';
import type { Palette } from '@/ui/palette';

import { ChannelMark } from './ChannelMark';
import { StatusBadge } from './channel-controls';

interface ChannelsCatalogProps {
  channels: NanobotFeatureInfo[];
  colors: Palette;
  enabledCount: number;
  error: string | null;
  filter: ChannelFilter;
  load: (mode: 'initial' | 'refresh') => Promise<void>;
  loading: boolean;
  payload: NanobotFeaturesPayload | null;
  query: string;
  refreshing: boolean;
  setError: (message: string | null) => void;
  setFilter: (filter: ChannelFilter) => void;
  setQuery: (query: string) => void;
  setSelected: (name: string) => void;
  showBrandLogos: boolean;
  totalCount: number;
}

export function ChannelsCatalog({
  channels,
  colors,
  enabledCount,
  error,
  filter,
  load,
  loading,
  payload,
  query,
  refreshing,
  setError,
  setFilter,
  setQuery,
  setSelected,
  showBrandLogos,
  totalCount,
}: ChannelsCatalogProps) {
  const { t } = useTranslation();
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          colors={[colors.muted]}
          enabled={!loading && !refreshing}
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
              total: totalCount,
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
            accessibilityLabel={t("common.clearSearch")}
            accessibilityRole="button"
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
              `${channelCopy(t, "filterAll", "All")} ${totalCount}`,
            ],
            ["on", `${channelCopy(t, "filterOn", "Running")} ${enabledCount}`],
            [
              "off",
              `${channelCopy(t, "filterOff", "Not running")} ${Math.max(
                0,
                totalCount - enabledCount,
              )}`,
            ],
          ] as Array<[ChannelFilter, string]>
        ).map(([value, label]) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}
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
          accessibilityLabel={t("common.refresh")}
          accessibilityRole="button"
          accessibilityState={{ busy: refreshing, disabled: loading || refreshing }}
          disabled={loading || refreshing}
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
          accessibilityRole="alert"
          style={[
            styles.errorBanner,
            { backgroundColor: colors.errorBackground },
          ]}
        >
          <CircleAlert color={colors.errorText} size={16} />
          <Text style={[styles.errorText, { color: colors.errorText }]}>
            {error}
          </Text>
          <View style={styles.errorActions}>
            <Pressable accessibilityRole="button" onPress={() => void load(payload ? "refresh" : "initial")}>
              <Text style={[styles.errorActionText, { color: colors.errorText }]}>{t("chat.retry")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setError(null)}>
              <Text style={[styles.errorActionText, { color: colors.errorText }]}>{t("common.dismiss")}</Text>
            </Pressable>
          </View>
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
                accessibilityRole="button"
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
  errorActions: { alignItems: "flex-end", gap: 7 },
  errorActionText: { fontSize: 11.5, fontWeight: "700" },
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
