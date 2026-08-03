import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useChannelConfiguration } from '@/features/channels/hooks/use-channel-configuration';
import { useChannelConnect } from '@/features/channels/hooks/use-channel-connect';
import {
  channelCopy,
  channelInstances,
  channelRunning,
  channelToggleChecked,
  resolveSelectedInstanceId,
} from '@/features/channels/model';
import { channelPresentation } from '@/features/channels/presentation/channel-presentation';
import type {
  NanobotFeatureInfo,
  NanobotFeaturesPayload,
} from '@/types/api/nanobot-features';

interface UseChannelDetailControllerOptions {
  actionKey: string | null;
  feature: NanobotFeatureInfo;
  onError: (message: string | null) => void;
  onPayload: (payload: NanobotFeaturesPayload) => void;
  onToggle: (
    feature: NanobotFeatureInfo,
    enabled: boolean,
    instanceId?: string,
  ) => Promise<void>;
}

export function useChannelDetailController(options: UseChannelDetailControllerOptions) {
  const { actionKey, feature, onError, onPayload, onToggle } = options;
  const { t } = useTranslation();
  const presentation = channelPresentation(feature);
  const setup = presentation.setup;
  const mode = setup.mode ?? 'credentials';
  const instances = useMemo(() => channelInstances(feature), [feature]);
  const hasInstancePanel = feature.instances !== undefined || feature.name === 'feishu';
  const [selectedInstanceId, setSelectedInstanceId] = useState(instances[0]?.id);
  const effectiveSelectedInstanceId = resolveSelectedInstanceId(
    instances,
    selectedInstanceId,
  );
  const instance = instances.find(
    (item) => item.id === effectiveSelectedInstanceId,
  );
  const instanceId = instance?.id;
  const fields = mode === 'credentials'
    ? (setup.fields ?? [])
    : mode === 'connect'
      ? (setup.manualFields ?? [])
      : [];
  const requiredFields = fields.filter((field) => !field.optional);
  const primaryFields = mode === 'credentials'
    ? requiredFields.length ? requiredFields : fields.slice(0, 1)
    : [];
  const advancedFields = mode === 'connect'
    ? fields
    : fields.filter((field) => field.optional);
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);

  const selectInstance = (nextInstanceId: string) => {
    if (nextInstanceId === instanceId) return;
    const nextInstance = instances.find((item) => item.id === nextInstanceId);
    connectController.reset();
    configuration.reset(nextInstance?.config_values);
    setSelectedInstanceId(nextInstanceId);
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
      onError(caught instanceof Error
        ? caught.message
        : channelCopy(t, 'copyFailed', 'Could not copy content.'));
    }
  };

  const openSetupUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
      onError(null);
    } catch (caught) {
      onError(caught instanceof Error
        ? caught.message
        : channelCopy(t, 'openLinkFailed', 'Could not open link.'));
    }
  };

  const applyPreset = (presetValues: Record<string, string>, label: string) => {
    configuration.applyPreset(presetValues);
    setSetupNotice(channelCopy(t, 'presetApplied', 'Applied {{name}} preset.', { name: label }));
  };

  const busy = actionKey !== null
    || configuration.saving
    || configuration.validating
    || connectController.busy;
  const running = instance
    ? instance.running || instance.runtime_status === 'running'
    : channelRunning(feature);
  const alwaysEnabled = feature.capabilities?.includes('always_enabled') === true;
  const enabled = instance?.enabled ?? channelToggleChecked(feature);
  const supportsConnect = mode === 'connect';
  const needsSetupBeforeEnable = !enabled
    && feature.configured === false
    && !(presentation.canConnectBeforeConfigured && supportsConnect);
  const channelToggleDisabled = alwaysEnabled
    || busy
    || needsSetupBeforeEnable
    || (!feature.install_supported && !feature.installed && !feature.enabled);
  const missingSupport = feature.enabled && !feature.installed;

  const requestFeatureToggle = (nextEnabled: boolean) => {
    if (
      nextEnabled
      && presentation.canConnectBeforeConfigured
      && !enabled
      && feature.configured === false
      && supportsConnect
    ) {
      void connectController.begin('replace');
      return;
    }
    if (nextEnabled && !feature.installed && feature.install_supported) {
      Alert.alert(
        channelCopy(t, 'installTitle', 'Install {{name}} support', {
          name: presentation.displayName,
        }),
        channelCopy(t, 'installDescription', 'Enabling this channel first installs the required dependencies on the nanobot server, then starts the channel. Continue?'),
        [
          { text: channelCopy(t, 'cancel', 'Cancel'), style: 'cancel' },
          {
            text: channelCopy(t, 'installAndEnable', 'Install and enable'),
            onPress: () => void onToggle(feature, true),
          },
        ],
      );
      return;
    }
    void onToggle(feature, nextEnabled);
  };

  return {
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
    running: Boolean(running),
    selectInstance,
    setAdvancedOpen,
    setup,
    setupNotice,
    supportsConnect,
  };
}
