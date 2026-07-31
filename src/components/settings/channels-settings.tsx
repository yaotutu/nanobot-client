import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCopy,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-native-qrcode-svg";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  cancelChannelConnect,
  configureChannel,
  fetchNanobotFeatures,
  pollChannelConnect,
  setNanobotFeatureEnabled,
  startChannelConnect,
  validateChannel,
} from "@/lib/api";
import { currentLocale } from "@/i18n";
import { channelPresentation } from "@/lib/channel-presentation";
import { DEFAULT_SERVER_URL } from "@/lib/config";
import type {
  ChannelConfigField,
  ChannelConnectPayload,
  ChannelPresentation,
  ChannelValidationPayload,
  NanobotChannelInstanceInfo,
  NanobotFeatureInfo,
  NanobotFeaturesPayload,
} from "@/types/nanobot";

import type { SettingsPalette } from "../settings-screen";

type ChannelFilter = "all" | "on" | "off";

function channelRunning(feature: NanobotFeatureInfo): boolean {
  return feature.running === true || feature.runtime_status === "running";
}

function channelToggleChecked(feature: NanobotFeatureInfo): boolean {
  return (
    feature.capabilities?.includes("always_enabled") === true ||
    feature.runtime_status === "running" ||
    feature.runtime_status === "starting"
  );
}

function channelCopy(
  t: TFunction,
  key: string,
  defaultValue: string,
  values: Record<string, string | number> = {},
): string {
  return t(`settings.channels.${key}`, { defaultValue, ...values });
}

function statusLabel(feature: NanobotFeatureInfo, t: TFunction): string {
  if (feature.runtime_status === "starting") {
    return channelCopy(t, "runtimeStarting", "Starting");
  }
  if (feature.runtime_status === "failed") {
    return channelCopy(t, "runtimeFailed", "Failed");
  }
  if (channelRunning(feature)) return channelCopy(t, "filterOn", "Running");
  if (!feature.installed)
    return channelCopy(t, "notInstalled", "Not installed");
  if (!feature.configured) return channelCopy(t, "needsConfig", "Needs setup");
  if (feature.enabled) return channelCopy(t, "enabled", "Enabled");
  return channelCopy(t, "filterOff", "Not running");
}

function instanceRunning(instance: NanobotChannelInstanceInfo): boolean {
  return instance.running === true || instance.runtime_status === "running";
}

function instanceStatusLabel(
  instance: NanobotChannelInstanceInfo,
  t: TFunction,
): string {
  if (instance.runtime_status === "starting") {
    return channelCopy(t, "runtimeStarting", "Starting");
  }
  if (instance.runtime_status === "failed") {
    return channelCopy(t, "runtimeFailed", "Failed");
  }
  if (instanceRunning(instance)) return channelCopy(t, "filterOn", "Running");
  if (!instance.configured) {
    return channelCopy(t, "authorizationRequired", "Authorization required");
  }
  if (instance.enabled) return channelCopy(t, "enabled", "Enabled");
  return channelCopy(t, "filterOff", "Not running");
}

function instanceDisplayName(instance: NanobotChannelInstanceInfo): string {
  return instance.display_name?.trim() || instance.name.trim() || instance.id;
}

function maskFeishuAppId(appId: string | undefined, t: TFunction): string {
  if (!appId) return channelCopy(t, "appIdMissing", "App ID not provided");
  if (appId.length <= 10) return appId;
  return `${appId.slice(0, 7)}...${appId.slice(-4)}`;
}

function defaultValues(
  fields: ChannelConfigField[],
  values: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      values?.[field.key] ??
        field.defaultValue ??
        field.options?.[0]?.value ??
        "",
    ]),
  );
}

function featureSearchText(feature: NanobotFeatureInfo, t: TFunction): string {
  const presentation = channelPresentation(feature);
  return [
    feature.name,
    feature.display_name,
    presentation.displayName,
    presentation.description,
    presentation.requirements,
    feature.status,
    feature.runtime_status,
    statusLabel(feature, t),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase(currentLocale());
}

function channelConnectInstruction(name: string, t: TFunction): string {
  if (name === "weixin") {
    return channelCopy(
      t,
      "connectInstructions.weixin",
      "Scan the QR code with WeChat. After sign-in, the account state is stored securely on the nanobot server.",
    );
  }
  if (name === "feishu") {
    return channelCopy(
      t,
      "connectInstructions.feishu",
      "Scan the QR code with Feishu or Lark and finish authorization on your phone.",
    );
  }
  if (name === "whatsapp") {
    return channelCopy(
      t,
      "connectInstructions.whatsapp",
      "Scan the QR code with WhatsApp and wait for the connection to finish.",
    );
  }
  return channelCopy(
    t,
    "connectInstructions.default",
    "Scan the QR code with the corresponding mobile app and wait for the connection to finish.",
  );
}

function channelConnectStatusLabel(
  connect: ChannelConnectPayload | null,
  t: TFunction,
): string | null {
  if (!connect) return null;
  if (connect.message?.trim()) return connect.message.trim();
  if (connect.status === "pending") {
    return channelCopy(
      t,
      "connectStatus.pending",
      "Waiting for scan or authorization…",
    );
  }
  if (connect.status === "succeeded") {
    return channelCopy(t, "connectStatus.succeeded", "Connected.");
  }
  if (connect.status === "expired") {
    return channelCopy(
      t,
      "connectStatus.expired",
      "The QR code expired. Generate a new one.",
    );
  }
  if (connect.status === "cancelled") {
    return channelCopy(t, "connectStatus.cancelled", "Connection cancelled.");
  }
  if (connect.status === "failed") {
    return channelCopy(
      t,
      "connectStatus.failed",
      "Connection failed. Try again.",
    );
  }
  return connect.status;
}

export function ChannelsSettings({
  token,
  colors,
  showBrandLogos,
}: {
  token: string;
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
        const next = await fetchNanobotFeatures(DEFAULT_SERVER_URL, token);
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
    [t, token],
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetchNanobotFeatures(DEFAULT_SERVER_URL, token)
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
  }, [t, token]);

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
      const next = await setNanobotFeatureEnabled(
        DEFAULT_SERVER_URL,
        token,
        enabled ? "enable" : "disable",
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
        token={token}
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

function ChannelDetail({
  token,
  colors,
  feature,
  actionKey,
  onBack,
  onToggle,
  onPayload,
  onError,
  showBrandLogos,
}: {
  token: string;
  colors: SettingsPalette;
  feature: NanobotFeatureInfo;
  actionKey: string | null;
  onBack: () => void;
  onToggle: (
    feature: NanobotFeatureInfo,
    enabled: boolean,
    instanceId?: string,
  ) => Promise<void>;
  onPayload: (payload: NanobotFeaturesPayload) => void;
  onError: (message: string | null) => void;
  showBrandLogos: boolean;
}) {
  const { t } = useTranslation();
  const presentation = channelPresentation(feature);
  const setup = presentation.setup;
  const mode = setup.mode ?? "credentials";
  const instances =
    feature.name === "feishu" && !feature.instances?.length
      ? [
          {
            id: "default",
            name: "nanobot",
            enabled: feature.enabled,
            running: feature.running,
            runtime_status: feature.runtime_status,
            runtime_error: feature.runtime_error,
            configured: Boolean(feature.configured),
            config_values: feature.config_values ?? {},
            configured_fields: feature.configured_fields ?? [],
          } satisfies NanobotChannelInstanceInfo,
        ]
      : (feature.instances ?? []);
  const hasInstancePanel =
    feature.instances !== undefined || feature.name === "feishu";
  const [selectedInstanceId, setInstanceId] = useState(instances[0]?.id);
  const instance =
    instances.find((item) => item.id === selectedInstanceId) ?? instances[0];
  const instanceId = instance?.id;
  const fields =
    mode === "credentials"
      ? (setup.fields ?? [])
      : mode === "connect"
        ? (setup.manualFields ?? [])
        : [];
  const requiredFields = fields.filter((field) => !field.optional);
  const primaryFields =
    mode === "credentials"
      ? requiredFields.length
        ? requiredFields
        : fields.slice(0, 1)
      : [];
  const advancedFields =
    mode === "connect" ? fields : fields.filter((field) => field.optional);
  const configValues = instance?.config_values ?? feature.config_values;
  const configuredFields = new Set(
    instance?.configured_fields ?? feature.configured_fields ?? [],
  );
  const [values, setValues] = useState(() =>
    defaultValues(fields, configValues),
  );
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(
    () => new Set(),
  );
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ChannelValidationPayload | null>(
    null,
  );
  const [connect, setConnect] = useState<ChannelConnectPayload | null>(null);
  const [connectMode, setConnectMode] = useState<"replace" | "create">(
    "replace",
  );
  const [connectBusy, setConnectBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const pollInFlight = useRef(false);
  const connectContext = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  const submission = () =>
    Object.fromEntries(
      fields.flatMap((field) => {
        const value = values[field.key] ?? "";
        if (field.secret && !value.trim()) return [];
        if (!touched.has(field.key) && !value.trim()) return [];
        if (!touched.has(field.key) && field.options?.length) return [];
        return [[field.key, value]];
      }),
    );

  const save = async () => {
    setSaving(true);
    onError(null);
    try {
      const result = await configureChannel(
        DEFAULT_SERVER_URL,
        token,
        feature.name,
        submission(),
        { instanceId },
      );
      if (result.nanobot_features) onPayload(result.nanobot_features);
      setValues((current) =>
        Object.fromEntries(
          fields.map((field) => [
            field.key,
            field.secret ? "" : (current[field.key] ?? ""),
          ]),
        ),
      );
      setVisibleSecrets(new Set());
      setTouched(new Set());
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : channelCopy(t, "saveFailed", "Could not save channel settings."),
      );
    } finally {
      setSaving(false);
    }
  };

  const runValidation = async () => {
    setValidating(true);
    onError(null);
    try {
      setValidation(
        await validateChannel(
          DEFAULT_SERVER_URL,
          token,
          feature.name,
          submission(),
          instanceId,
        ),
      );
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : channelCopy(t, "validateFailed", "Could not validate channel."),
      );
    } finally {
      setValidating(false);
    }
  };

  const checkAndEnable = async () => {
    setSaving(true);
    setValidating(true);
    onError(null);
    try {
      const valuesForSubmit = submission();
      const validationPayload = await validateChannel(
        DEFAULT_SERVER_URL,
        token,
        feature.name,
        valuesForSubmit,
        instanceId,
      );
      setValidation(validationPayload);
      if (!validationPayload.can_enable) {
        onError(
          validationPayload.message ||
            channelCopy(
              t,
              "validationFailed",
              "Check the required setup before enabling.",
            ),
        );
        return;
      }
      const result = await configureChannel(
        DEFAULT_SERVER_URL,
        token,
        feature.name,
        valuesForSubmit,
        { enable: true, instanceId },
      );
      if (result.nanobot_features) onPayload(result.nanobot_features);
      setValues((current) =>
        Object.fromEntries(
          fields.map((field) => [
            field.key,
            field.secret ? "" : (current[field.key] ?? ""),
          ]),
        ),
      );
      setVisibleSecrets(new Set());
      setTouched(new Set());
      onError(null);
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : channelCopy(
              t,
              "checkAndEnableFailed",
              "Could not check and enable channel.",
            ),
      );
    } finally {
      setSaving(false);
      setValidating(false);
    }
  };

  useEffect(() => {
    if (
      appState !== "active" ||
      !connect?.session_id ||
      connect.status !== "pending"
    ) {
      return;
    }

    let cancelled = false;
    const context = connectContext.current;
    const poll = async () => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      try {
        const next = await pollChannelConnect(
          DEFAULT_SERVER_URL,
          token,
          feature.name,
          connect.session_id,
        );
        if (cancelled || context !== connectContext.current) return;
        setConnect((current) => ({
          ...(current ?? next),
          ...next,
          qr_url: next.qr_url ?? current?.qr_url,
        }));
        if (next.nanobot_features) onPayload(next.nanobot_features);
        if (next.status !== "pending") onError(null);
      } catch (caught) {
        if (!cancelled && context === connectContext.current) {
          onError(
            caught instanceof Error
              ? caught.message
              : channelCopy(
                  t,
                  "connectPollFailed",
                  "Could not refresh connection status.",
                ),
          );
        }
      } finally {
        pollInFlight.current = false;
      }
    };

    const initialTimer = setTimeout(() => void poll(), 900);
    const intervalTimer = setInterval(
      () => void poll(),
      Math.max(2_500, connect.interval_ms ?? 5_000),
    );
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [
    appState,
    connect?.interval_ms,
    connect?.session_id,
    connect?.status,
    feature.name,
    onError,
    onPayload,
    t,
    token,
  ]);

  const beginConnect = async (mode: "replace" | "create" = "replace") => {
    const context = connectContext.current;
    setConnectMode(mode);
    setConnectBusy(true);
    onError(null);
    try {
      const state = await startChannelConnect(
        DEFAULT_SERVER_URL,
        token,
        feature.name,
        feature.name === "feishu"
          ? {
              domain: "feishu",
              instanceId:
                mode === "create" ? "default" : (instanceId ?? "default"),
              mode,
            }
          : {
              instanceId,
              force:
                feature.name === "weixin" && connect?.status === "succeeded",
            },
      );
      if (context === connectContext.current) setConnect(state);
    } catch (caught) {
      if (context === connectContext.current) {
        onError(
          caught instanceof Error
            ? caught.message
            : channelCopy(
                t,
                "connectStartFailed",
                "Could not start the connection flow.",
              ),
        );
      }
    } finally {
      if (context === connectContext.current) setConnectBusy(false);
    }
  };

  const cancelConnect = async () => {
    if (!connect) return;
    const context = connectContext.current;
    setConnectBusy(true);
    try {
      const next = await cancelChannelConnect(
        DEFAULT_SERVER_URL,
        token,
        feature.name,
        connect.session_id,
      );
      if (context === connectContext.current) setConnect(next);
    } catch (caught) {
      if (context === connectContext.current) {
        onError(
          caught instanceof Error
            ? caught.message
            : channelCopy(
                t,
                "connectCancelFailed",
                "Could not cancel connection.",
              ),
        );
      }
    } finally {
      if (context === connectContext.current) setConnectBusy(false);
    }
  };

  const selectInstance = (nextInstanceId: string) => {
    if (nextInstanceId === instanceId) return;
    const nextInstance = instances.find((item) => item.id === nextInstanceId);
    connectContext.current += 1;
    pollInFlight.current = false;
    setConnect(null);
    setConnectMode("replace");
    setConnectBusy(false);
    setInstanceId(nextInstanceId);
    setValues(defaultValues(fields, nextInstance?.config_values));
    setTouched(new Set());
    setVisibleSecrets(new Set());
    setValidation(null);
    setAdvancedOpen(false);
    setSetupNotice(null);
    onError(null);
  };

  const copySetupText = async (value: string, successMessage: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setSetupNotice(successMessage);
      onError(null);
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : channelCopy(t, "copyFailed", "Could not copy content."),
      );
    }
  };

  const openSetupUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
      onError(null);
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : channelCopy(t, "openLinkFailed", "Could not open link."),
      );
    }
  };

  const applyPreset = (presetValues: Record<string, string>, label: string) => {
    setValues((current) => ({ ...current, ...presetValues }));
    setTouched((current) => {
      const next = new Set(current);
      Object.keys(presetValues).forEach((key) => next.add(key));
      return next;
    });
    setSetupNotice(
      channelCopy(t, "presetApplied", "Applied {{name}} preset.", {
        name: label,
      }),
    );
  };

  const busy = actionKey !== null || saving || validating || connectBusy;
  const running = instance
    ? instance.running || instance.runtime_status === "running"
    : channelRunning(feature);
  const alwaysEnabled =
    feature.capabilities?.includes("always_enabled") === true;
  const enabled = instance?.enabled ?? channelToggleChecked(feature);
  const supportsConnect = mode === "connect";
  const needsSetupBeforeEnable =
    !enabled &&
    feature.configured === false &&
    !(presentation.canConnectBeforeConfigured && supportsConnect);
  const channelToggleDisabled =
    alwaysEnabled ||
    busy ||
    needsSetupBeforeEnable ||
    (!feature.install_supported && !feature.installed && !feature.enabled);
  const missingSupport = feature.enabled && !feature.installed;

  const requestFeatureToggle = (nextEnabled: boolean) => {
    if (
      nextEnabled &&
      presentation.canConnectBeforeConfigured &&
      !enabled &&
      feature.configured === false &&
      supportsConnect
    ) {
      void beginConnect("replace");
      return;
    }
    if (nextEnabled && !feature.installed && feature.install_supported) {
      Alert.alert(
        channelCopy(t, "installTitle", "Install {{name}} support", {
          name: presentation.displayName,
        }),
        channelCopy(
          t,
          "installDescription",
          "Enabling this channel first installs the required dependencies on the nanobot server, then starts the channel. Continue?",
        ),
        [
          { text: channelCopy(t, "cancel", "Cancel"), style: "cancel" },
          {
            text: channelCopy(t, "installAndEnable", "Install and enable"),
            onPress: () => void onToggle(feature, true),
          },
        ],
      );
      return;
    }
    void onToggle(feature, nextEnabled);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.detailPage}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        accessibilityLabel={channelCopy(t, "backToChannels", "All channels")}
        onPress={onBack}
        style={styles.backRow}
      >
        <ArrowLeft color={colors.muted} size={17} />
        <Text style={[styles.backText, { color: colors.muted }]}>
          {channelCopy(t, "catalog", "Channels")}
        </Text>
      </Pressable>
      <View style={styles.detailHeader}>
        <View
          style={[
            styles.detailIcon,
            { backgroundColor: `${presentation.color}18` },
          ]}
        >
          <ChannelMark
            presentation={presentation}
            showBrandLogos={showBrandLogos}
            size="large"
          />
        </View>
        <View style={styles.detailHeading}>
          <Text style={[styles.detailTitle, { color: colors.foreground }]}>
            {presentation.displayName}
          </Text>
          <Text style={[styles.detailSubtitle, { color: colors.muted }]}>
            {presentation.description ?? feature.name}
          </Text>
          {missingSupport && feature.install_supported ? (
            <Pressable
              disabled={busy}
              onPress={() => requestFeatureToggle(true)}
              style={styles.installSupportButton}
            >
              {busy ? (
                <ActivityIndicator color={colors.muted} size="small" />
              ) : (
                <Plus color={colors.muted} size={14} />
              )}
              <Text
                style={[styles.installSupportText, { color: colors.muted }]}
              >
                {channelCopy(t, "installSupport", "Install support")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {actionKey ? (
          <ActivityIndicator color={colors.muted} size="small" />
        ) : null}
        {!hasInstancePanel ? (
          <Switch
            disabled={channelToggleDisabled}
            onValueChange={requestFeatureToggle}
            trackColor={{ true: colors.foreground }}
            value={Boolean(enabled)}
          />
        ) : null}
      </View>
      <View style={styles.badges}>
        <StatusBadge
          colors={colors}
          failed={
            (instance?.runtime_status ?? feature.runtime_status) === "failed"
          }
          running={Boolean(running)}
          text={
            running
              ? channelCopy(t, "filterOn", "Running")
              : statusLabel(feature, t)
          }
        />
        <Text style={[styles.requirementText, { color: colors.muted }]}>
          {alwaysEnabled
            ? channelCopy(t, "alwaysEnabledByWebui", "Always enabled by WebUI")
            : (presentation.requirements ??
              (feature.ready
                ? channelCopy(t, "runtimeReady", "Runtime dependencies ready")
                : channelCopy(
                    t,
                    "runtimeNotReady",
                    "Runtime dependencies not ready",
                  )))}
        </Text>
      </View>
      {(instance?.runtime_error ?? feature.runtime_error) ? (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: colors.errorBackground },
          ]}
        >
          <CircleAlert color={colors.errorText} size={16} />
          <Text style={[styles.errorText, { color: colors.errorText }]}>
            {instance?.runtime_error ?? feature.runtime_error}
          </Text>
        </View>
      ) : null}

      <Section
        colors={colors}
        title={channelCopy(t, "requiredSetup", "Required setup")}
      >
        <View style={styles.setupHeadingRow}>
          <Text style={[styles.setupHeading, { color: colors.foreground }]}>
            {mode === "webui"
              ? channelCopy(t, "managedByWebui", "Managed by WebUI")
              : channelCopy(t, "channelConfiguration", "Channel configuration")}
          </Text>
          <View
            style={[
              styles.setupModeBadge,
              {
                backgroundColor:
                  mode === "webui" ? "#E6F5EE" : colors.background,
              },
            ]}
          >
            {mode === "webui" ? <Check color="#16865C" size={13} /> : null}
            <Text
              style={[
                styles.setupModeText,
                { color: mode === "webui" ? "#16865C" : colors.muted },
              ]}
            >
              {mode === "webui"
                ? channelCopy(t, "managedByWebui", "Managed by WebUI")
                : feature.configured
                  ? channelCopy(t, "instanceConfigured", "Configured")
                  : channelCopy(t, "needsConfig", "Needs setup")}
            </Text>
          </View>
        </View>
        {presentation.requirements ? (
          <Text style={[styles.helper, { color: colors.muted }]}>
            {presentation.requirements}
          </Text>
        ) : null}
        {setup.summary ? (
          <Text style={[styles.helper, { color: colors.muted }]}>
            {setup.summary}
          </Text>
        ) : null}
        <View style={styles.actionRow}>
          {setup.docsUrl ? (
            <ActionButton
              colors={colors}
              label={
                setup.docsLabel ?? channelCopy(t, "setupGuide", "Setup guide")
              }
              onPress={() => void openSetupUrl(setup.docsUrl!)}
            />
          ) : null}
          {setup.officialUrl ? (
            <ActionButton
              colors={colors}
              label={
                setup.officialLabel ??
                channelCopy(t, "officialGuide", "Official guide")
              }
              onPress={() => void openSetupUrl(setup.officialUrl!)}
            />
          ) : null}
          {setup.actions?.map((action) => (
            <ActionButton
              colors={colors}
              key={action.id}
              label={action.label}
              onPress={() => {
                if (action.copyText) {
                  void copySetupText(
                    action.copyText,
                    channelCopy(t, "helperCopied", "{{name}} copied.", {
                      name: action.label,
                    }),
                  );
                } else if (action.url) {
                  void openSetupUrl(action.url);
                }
              }}
            />
          ))}
        </View>
        {setup.command ? (
          <View
            style={[
              styles.commandBox,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              selectable
              style={[styles.commandText, { color: colors.foreground }]}
            >
              {setup.command}
            </Text>
            <Pressable
              accessibilityLabel={channelCopy(t, "copyCommand", "Copy command")}
              onPress={() =>
                void copySetupText(
                  setup.command!,
                  channelCopy(t, "commandCopied", "Command copied."),
                )
              }
              style={styles.commandCopy}
            >
              <ClipboardCopy color={colors.muted} size={16} />
            </Pressable>
          </View>
        ) : null}
        {setupNotice ? (
          <Text style={[styles.notice, { color: colors.muted }]}>
            {setupNotice}
          </Text>
        ) : null}
      </Section>

      {hasInstancePanel ? (
        <Section
          colors={colors}
          title={
            feature.name === "feishu"
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
              const itemBusy =
                actionKey?.endsWith(`:${feature.name}:${item.id}`) ?? false;
              return (
                <View
                  key={item.id}
                  style={[
                    styles.instanceCard,
                    {
                      backgroundColor: selected
                        ? colors.pressed
                        : colors.background,
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
                      onPress={() => selectInstance(item.id)}
                      style={styles.instanceSelect}
                    >
                      <View style={styles.instanceCopy}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.instanceName,
                            { color: colors.foreground },
                          ]}
                        >
                          {instanceDisplayName(item)}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.instanceSummary,
                            { color: colors.muted },
                          ]}
                        >
                          {feature.name === "feishu"
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
                      onValueChange={(value) =>
                        void onToggle(feature, value, item.id)
                      }
                      value={Boolean(
                        itemRunning || item.runtime_status === "starting",
                      )}
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
                      {feature.name === "feishu" && item.configured ? (
                        <ActionButton
                          colors={colors}
                          disabled={busy || !item.enabled}
                          label={
                            itemBusy
                              ? channelCopy(t, "reconnecting", "Reconnecting…")
                              : channelCopy(t, "reconnect", "Reconnect")
                          }
                          onPress={() => void onToggle(feature, true, item.id)}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Section>
      ) : null}

      {supportsConnect &&
      (feature.name !== "feishu" || !instance?.configured || connect) ? (
        <Section
          colors={colors}
          title={
            connectMode === "create"
              ? channelCopy(t, "createAssistant", "Create assistant")
              : channelCopy(t, "connect", "Connect")
          }
        >
          <Text style={[styles.helper, { color: colors.muted }]}>
            {connectMode === "create"
              ? channelCopy(
                  t,
                  "createAssistantInstruction",
                  "Scan the QR code with Feishu or Lark to create an independent assistant for another team, space, or workflow.",
                )
              : channelConnectInstruction(feature.name, t)}
          </Text>
          {connect?.qr_url ? (
            <View
              accessibilityLabel={channelCopy(
                t,
                "loginQrCode",
                "Channel sign-in QR code",
              )}
              accessible
              style={[
                styles.qrFrame,
                { backgroundColor: "#FFFFFF", borderColor: colors.border },
              ]}
            >
              <QRCode
                backgroundColor="#FFFFFF"
                color="#111827"
                quietZone={8}
                size={210}
                value={connect.qr_url}
              />
            </View>
          ) : null}
          {channelConnectStatusLabel(connect, t) ? (
            <Text style={[styles.notice, { color: colors.muted }]}>
              {channelConnectStatusLabel(connect, t)}
            </Text>
          ) : null}
          <View style={styles.actionRow}>
            <ActionButton
              colors={colors}
              disabled={connect?.status === "pending" || connectBusy}
              label={
                connectBusy
                  ? channelCopy(t, "processing", "Processing…")
                  : connect?.status === "pending"
                    ? channelCopy(t, "connecting", "Connecting…")
                    : connect?.status === "succeeded"
                      ? connectMode === "create"
                        ? channelCopy(t, "createAnother", "Create another")
                        : channelCopy(t, "scanAgain", "Scan again")
                      : connectMode === "create"
                        ? channelCopy(t, "createAssistant", "Create assistant")
                        : channelCopy(t, "startConnection", "Start connection")
              }
              onPress={() => void beginConnect(connectMode)}
              primary
            />
            {connect?.status === "pending" ? (
              <ActionButton
                colors={colors}
                disabled={connectBusy}
                label={
                  connectBusy
                    ? channelCopy(t, "cancelling", "Cancelling…")
                    : channelCopy(t, "cancel", "Cancel")
                }
                onPress={() => void cancelConnect()}
              />
            ) : null}
          </View>
        </Section>
      ) : null}

      {feature.name === "feishu" && hasInstancePanel ? (
        <Section
          colors={colors}
          title={channelCopy(
            t,
            "createAnotherAssistant",
            "Create another assistant",
          )}
        >
          <Text style={[styles.helper, { color: colors.muted }]}>
            {channelCopy(
              t,
              "createAnotherAssistantDescription",
              "Create an independent Feishu bot assistant for another team, space, or workflow.",
            )}
          </Text>
          <View style={styles.actionRow}>
            <ActionButton
              colors={colors}
              disabled={connectBusy || connect?.status === "pending"}
              label={
                connectMode === "create" && connectBusy
                  ? channelCopy(t, "creating", "Creating…")
                  : channelCopy(t, "createAssistant", "Create assistant")
              }
              onPress={() => void beginConnect("create")}
              primary
            />
          </View>
        </Section>
      ) : null}

      {mode !== "webui" ? (
        <Section
          colors={colors}
          title={channelCopy(t, "configuration", "Configuration")}
        >
          {setup.presets?.length ? (
            <View style={styles.presetRow}>
              {setup.presets.map((preset) => (
                <Pressable
                  accessibilityRole="radio"
                  key={preset.id}
                  onPress={() => applyPreset(preset.values, preset.label)}
                  style={[
                    styles.presetButton,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.presetText, { color: colors.foreground }]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {primaryFields.length ? (
            <ChannelFields
              colors={colors}
              configuredFields={configuredFields}
              fields={primaryFields}
              onChange={(key, value) => {
                setValues((current) => ({ ...current, [key]: value }));
                setTouched((current) => new Set(current).add(key));
              }}
              onToggleSecret={(key) =>
                setVisibleSecrets((current) => {
                  const next = new Set(current);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              touched={touched}
              values={values}
              visibleSecrets={visibleSecrets}
            />
          ) : mode === "credentials" ? (
            <Text style={[styles.helper, { color: colors.muted }]}>
              {channelCopy(
                t,
                "noCredentialFields",
                "This channel has no editable credential fields. Follow the documentation to finish external setup.",
              )}
            </Text>
          ) : (
            <Text style={[styles.helper, { color: colors.muted }]}>
              {channelCopy(
                t,
                "connectSavesCredentials",
                "QR connection saves the primary credentials automatically. Manual fields are available under Advanced.",
              )}
            </Text>
          )}
          <View style={styles.actionRow}>
            {supportsConnect ? (
              <>
                <ActionButton
                  colors={colors}
                  disabled={busy || touched.size === 0}
                  label={
                    saving
                      ? channelCopy(t, "saving", "Saving…")
                      : channelCopy(
                          t,
                          "saveManualSettings",
                          "Save manual settings",
                        )
                  }
                  onPress={() => void save()}
                  primary
                />
                <ActionButton
                  colors={colors}
                  disabled={busy}
                  label={
                    validating
                      ? channelCopy(t, "validating", "Validating…")
                      : channelCopy(t, "validate", "Validate")
                  }
                  onPress={() => void runValidation()}
                />
              </>
            ) : (
              <>
                <ActionButton
                  colors={colors}
                  disabled={busy}
                  label={
                    saving || validating
                      ? channelCopy(t, "checking", "Checking...")
                      : running
                        ? channelCopy(t, "checkConnection", "Check connection")
                        : channelCopy(t, "checkAndEnable", "Check and enable")
                  }
                  onPress={() => void checkAndEnable()}
                  primary
                />
                {Boolean(instance?.configured ?? feature.configured) ||
                validation ? (
                  <ActionButton
                    colors={colors}
                    disabled={busy}
                    label={
                      validating
                        ? channelCopy(t, "checking", "Checking...")
                        : channelCopy(t, "checkOnly", "Check only")
                    }
                    onPress={() => void runValidation()}
                  />
                ) : null}
              </>
            )}
          </View>
          {advancedFields.length ? (
            <View
              style={[styles.advancedWrap, { borderTopColor: colors.border }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: advancedOpen }}
                onPress={() => setAdvancedOpen((current) => !current)}
                style={styles.advancedHeader}
              >
                <Text
                  style={[styles.advancedTitle, { color: colors.foreground }]}
                >
                  {channelCopy(t, "advanced", "Advanced")}
                </Text>
                <ChevronDown
                  color={colors.muted}
                  size={16}
                  style={{
                    transform: [{ rotate: advancedOpen ? "180deg" : "0deg" }],
                  }}
                />
              </Pressable>
              {advancedOpen ? (
                <ChannelFields
                  colors={colors}
                  configuredFields={configuredFields}
                  fields={advancedFields}
                  onChange={(key, value) => {
                    setValues((current) => ({ ...current, [key]: value }));
                    setTouched((current) => new Set(current).add(key));
                  }}
                  onToggleSecret={(key) =>
                    setVisibleSecrets((current) => {
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  touched={touched}
                  values={values}
                  visibleSecrets={visibleSecrets}
                />
              ) : null}
            </View>
          ) : null}
        </Section>
      ) : null}

      {setup.steps.length ? (
        <Section
          colors={colors}
          title={channelCopy(t, "setupSteps", "Next steps")}
        >
          <View style={styles.stepsList}>
            {setup.steps.map((step, index) => (
              <View key={`${index}:${step}`} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepNumber,
                    { backgroundColor: colors.background },
                  ]}
                >
                  <Text
                    style={[styles.stepNumberText, { color: colors.muted }]}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text style={[styles.stepText, { color: colors.muted }]}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
          {setup.tryIt ? (
            <View
              style={[
                styles.tryItBox,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.tryItTitle, { color: colors.foreground }]}>
                {channelCopy(t, "tryIt", "Try it")}
              </Text>
              <Text style={[styles.tryItText, { color: colors.muted }]}>
                {setup.tryIt}
              </Text>
            </View>
          ) : null}
        </Section>
      ) : null}

      {validation ? (
        <Section
          colors={colors}
          title={channelCopy(t, "validationResult", "Validation result")}
        >
          <View style={styles.validationTitle}>
            {validation.status === "connected" ||
            validation.status === "configured" ? (
              <Check color="#16865C" size={17} />
            ) : (
              <CircleAlert
                color={
                  validation.status === "invalid" ? colors.errorText : "#B27818"
                }
                size={17}
              />
            )}
            <Text
              style={[styles.validationStatus, { color: colors.foreground }]}
            >
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
                    onPress={() => void openSetupUrl(check.action_url!)}
                    style={styles.validationLink}
                  >
                    <ExternalLink color={colors.muted} size={13} />
                    <Text
                      style={[
                        styles.validationLinkText,
                        { color: colors.muted },
                      ]}
                    >
                      {channelCopy(t, "open", "Open")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function ChannelMark({
  presentation,
  showBrandLogos,
  size,
}: {
  presentation: ChannelPresentation;
  showBrandLogos: boolean;
  size: "small" | "large";
}) {
  const [failed, setFailed] = useState(false);
  const imageSize = size === "large" ? 32 : 25;
  if (showBrandLogos && presentation.logoUrl && !failed) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        contentFit="contain"
        onError={() => setFailed(true)}
        source={{ uri: presentation.logoUrl }}
        style={{ width: imageSize, height: imageSize }}
      />
    );
  }
  return (
    <Text
      style={[
        size === "large" ? styles.detailInitials : styles.channelInitials,
        { color: presentation.color },
      ]}
    >
      {presentation.initials}
    </Text>
  );
}

function ChannelFields({
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

function Section({
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

function ActionButton({
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

function StatusBadge({
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
  channelInitials: { fontSize: 12, fontWeight: "800" },
  channelCopy: { flex: 1, minWidth: 0 },
  channelName: { fontSize: 14, fontWeight: "700" },
  channelMeta: { marginTop: 3, fontSize: 11.5 },
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
  detailPage: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 38 },
  backRow: {
    minHeight: 38,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 12,
  },
  backText: { fontSize: 13, fontWeight: "600" },
  detailHeader: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  detailIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  detailInitials: { fontSize: 14, fontWeight: "800" },
  detailHeading: { flex: 1, minWidth: 0 },
  detailTitle: { fontSize: 20, fontWeight: "700" },
  detailSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 17 },
  installSupportButton: {
    minHeight: 30,
    marginTop: 7,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  installSupportText: { fontSize: 11.5, fontWeight: "700" },
  badges: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  requirementText: { fontSize: 11.5 },
  section: { marginTop: 24, gap: 8 },
  sectionTitle: { paddingHorizontal: 3, fontSize: 12, fontWeight: "600" },
  sectionCard: { borderRadius: 20, padding: 14, gap: 13 },
  helper: { fontSize: 12.5, lineHeight: 19 },
  setupHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  setupHeading: { flex: 1, fontSize: 13, fontWeight: "700" },
  setupModeBadge: {
    minHeight: 26,
    borderRadius: 13,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  setupModeText: { fontSize: 10.5, fontWeight: "700" },
  commandBox: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingLeft: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commandText: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: "monospace",
  },
  commandCopy: {
    width: 42,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
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
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  presetButton: {
    minHeight: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  presetText: { fontSize: 11.5, fontWeight: "700" },
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
  advancedWrap: {
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  advancedHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  advancedTitle: { fontSize: 12.5, fontWeight: "700" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  qrFrame: {
    alignSelf: "center",
    width: 230,
    height: 230,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  notice: { fontSize: 12.5, lineHeight: 18 },
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
  stepsList: { gap: 10 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { fontSize: 10, fontWeight: "800" },
  stepText: { flex: 1, fontSize: 12.5, lineHeight: 19 },
  tryItBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    padding: 11,
    gap: 4,
  },
  tryItTitle: { fontSize: 12, fontWeight: "700" },
  tryItText: { fontSize: 12, lineHeight: 18 },
});
