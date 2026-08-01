import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCopy,
  ExternalLink,
  Plus,
  X,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-native-qrcode-svg";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import {
  cancelChannelConnect,
  configureChannel,
  pollChannelConnect,
  startChannelConnect,
  validateChannel,
} from "@/features/channels/api";
import { channelPresentation } from "@/features/channels/channel-presentation";
import type {
  ChannelConnectPayload,
  ChannelValidationPayload,
  NanobotChannelInstanceInfo,
  NanobotFeatureInfo,
  NanobotFeaturesPayload,
} from "@/types/api";
import type { SettingsPalette } from "../../screens/settings-screen";

import {
  channelConnectInstruction,
  channelConnectStatusLabel,
  channelCopy,
  channelRunning,
  channelToggleChecked,
  defaultValues,
  instanceDisplayName,
  instanceRunning,
  instanceStatusLabel,
  maskFeishuAppId,
  statusLabel,
} from "./channels-utils";
import { ChannelMark } from "./ChannelMark";
import { ChannelFields } from "./ChannelFields";
import { ActionButton, Section, StatusBadge } from "./channel-controls";

export function ChannelDetail({
  colors,
  feature,
  actionKey,
  onBack,
  onToggle,
  onPayload,
  onError,
  showBrandLogos,
}: {
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
      const result = await configureChannel(feature.name,
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
        await validateChannel(feature.name,
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
      const validationPayload = await validateChannel(feature.name,
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
      const result = await configureChannel(feature.name,
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
        const next = await pollChannelConnect(feature.name,
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
  ]);

  const beginConnect = async (mode: "replace" | "create" = "replace") => {
    const context = connectContext.current;
    setConnectMode(mode);
    setConnectBusy(true);
    onError(null);
    try {
      const state = await startChannelConnect(feature.name,
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
      const next = await cancelChannelConnect(feature.name,
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


const styles = StyleSheet.create({
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
  errorBanner: {
    marginTop: 12,
    borderRadius: 14,
    padding: 11,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
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
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
