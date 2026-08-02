import {
  ArrowLeft,
  CircleAlert,
  Plus,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { channelPresentation } from "@/features/channels/channel-presentation";
import type {
  NanobotChannelInstanceInfo,
  NanobotFeatureInfo,
  NanobotFeaturesPayload,
} from '@/types/api/channels';
import type { SettingsPalette } from "@/features/settings/types";

import {
  channelCopy,
  channelRunning,
  channelToggleChecked,
  statusLabel,
} from "./channels-utils";
import { ChannelMark } from "./ChannelMark";
import { ChannelInstancesSection } from "./ChannelInstancesSection";
import { ChannelValidationSection } from "./ChannelValidationSection";
import { StatusBadge } from "./channel-controls";
import { useChannelConfiguration } from "@/features/channels/hooks/use-channel-configuration";
import { useChannelConnect } from "@/features/channels/hooks/use-channel-connect";
import { ChannelConnectSection } from "./ChannelConnectSection";
import { ChannelConfigurationSection } from "./ChannelConfigurationSection";
import {
  ChannelNextStepsSection,
  ChannelSetupSection,
} from "./ChannelSetupSection";

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
  const configuration = useChannelConfiguration({
    configValues,
    featureName: feature.name,
    fields,
    instanceId,
    onError,
    onPayload,
    t,
  });
  const connectController = useChannelConnect({
    channelName: feature.name,
    instanceId,
    onError,
    onPayload,
    t,
  });
  const {
    changeValue,
    checkAndEnable,
    runValidation,
    save,
    saving,
    toggleSecret,
    touched,
    validating,
    validation,
    values,
    visibleSecrets,
  } = configuration;
  const {
    begin: beginConnect,
    busy: connectBusy,
    cancel: cancelConnect,
    connect,
    mode: connectMode,
  } = connectController;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);

  const selectInstance = (nextInstanceId: string) => {
    if (nextInstanceId === instanceId) return;
    const nextInstance = instances.find((item) => item.id === nextInstanceId);
    connectController.reset();
    configuration.reset(nextInstance?.config_values);
    setInstanceId(nextInstanceId);
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
    configuration.applyPreset(presetValues);
    setSetupNotice(channelCopy(t, "presetApplied", "Applied {{name}} preset.", {
      name: label,
    }));
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

      <ChannelSetupSection
        colors={colors}
        configured={feature.configured}
        mode={mode}
        notice={setupNotice}
        onCopy={copySetupText}
        onOpenUrl={openSetupUrl}
        requirements={presentation.requirements}
        setup={setup}
      />

      {hasInstancePanel ? (
        <ChannelInstancesSection
          actionKey={actionKey}
          busy={busy}
          colors={colors}
          featureName={feature.name}
          instanceId={instanceId}
          instances={instances}
          onSelect={selectInstance}
          onToggle={(nextEnabled, nextInstanceId) =>
            onToggle(feature, nextEnabled, nextInstanceId)
          }
        />
      ) : null}

      <ChannelConnectSection
        busy={connectBusy}
        channelName={feature.name}
        colors={colors}
        connect={connect}
        hasInstancePanel={hasInstancePanel}
        instanceConfigured={Boolean(instance?.configured)}
        mode={connectMode}
        onBegin={beginConnect}
        onCancel={cancelConnect}
        supportsConnect={supportsConnect}
      />

      <ChannelConfigurationSection
        advancedFields={advancedFields}
        advancedOpen={advancedOpen}
        busy={busy}
        colors={colors}
        configured={Boolean(instance?.configured ?? feature.configured)}
        configuredFields={configuredFields}
        mode={mode}
        onApplyPreset={applyPreset}
        onChange={changeValue}
        onCheckAndEnable={checkAndEnable}
        onSave={save}
        onToggleAdvanced={() => setAdvancedOpen((current) => !current)}
        onToggleSecret={toggleSecret}
        onValidate={runValidation}
        presets={setup.presets}
        primaryFields={primaryFields}
        running={Boolean(running)}
        saving={saving}
        supportsConnect={supportsConnect}
        touched={touched}
        validating={validating}
        validation={validation}
        values={values}
        visibleSecrets={visibleSecrets}
      />

      <ChannelNextStepsSection colors={colors} setup={setup} />

      {validation ? (
        <ChannelValidationSection
          colors={colors}
          onOpenUrl={openSetupUrl}
          validation={validation}
        />
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

});
