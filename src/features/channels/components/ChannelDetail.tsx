import {
  ArrowLeft,
  CircleAlert,
  Plus,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { useChannelDetailController } from '@/features/channels/hooks/use-channel-detail-controller';
import { channelCopy, statusLabel } from '@/features/channels/model';
import type {
  NanobotFeatureInfo,
  NanobotFeaturesPayload,
} from '@/types/api/nanobot-features';
import type { Palette } from '@/ui/palette';

import { ChannelMark } from "./ChannelMark";
import { ChannelInstancesSection } from "./ChannelInstancesSection";
import { ChannelValidationSection } from "./ChannelValidationSection";
import { StatusBadge } from "./channel-controls";
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
  colors: Palette;
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
  const detail = useChannelDetailController({
    actionKey,
    feature,
    onError,
    onPayload,
    onToggle,
  });
  const {
    advancedFields,
    advancedOpen,
    alwaysEnabled,
    applyPreset,
    busy,
    channelToggleDisabled,
    configuration,
    connectController,
    configuredFields,
    copySetupText,
    enabled,
    hasInstancePanel,
    instance,
    instanceId,
    instances,
    missingSupport,
    mode,
    openSetupUrl,
    presentation,
    primaryFields,
    requestFeatureToggle,
    running,
    selectInstance,
    setAdvancedOpen,
    setup,
    setupNotice,
    supportsConnect,
  } = detail;
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
