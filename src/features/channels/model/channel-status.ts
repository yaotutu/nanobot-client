import type { TFunction } from 'i18next';

import type {
  NanobotChannelInstanceInfo,
  NanobotFeatureInfo,
} from '@/types/api/nanobot-features';

import { channelCopy } from './channel-copy';

export type ChannelFilter = 'all' | 'on' | 'off';

export function channelRunning(feature: NanobotFeatureInfo): boolean {
  return feature.running === true || feature.runtime_status === 'running';
}

export function channelToggleChecked(feature: NanobotFeatureInfo): boolean {
  return (
    feature.capabilities?.includes('always_enabled') === true
    || feature.runtime_status === 'running'
    || feature.runtime_status === 'starting'
  );
}

export function statusLabel(feature: NanobotFeatureInfo, t: TFunction): string {
  if (feature.runtime_status === 'starting') return channelCopy(t, 'runtimeStarting', 'Starting');
  if (feature.runtime_status === 'failed') return channelCopy(t, 'runtimeFailed', 'Failed');
  if (channelRunning(feature)) return channelCopy(t, 'filterOn', 'Running');
  if (!feature.installed) return channelCopy(t, 'notInstalled', 'Not installed');
  if (!feature.configured) return channelCopy(t, 'needsConfig', 'Needs setup');
  if (feature.enabled) return channelCopy(t, 'enabled', 'Enabled');
  return channelCopy(t, 'filterOff', 'Not running');
}

export function instanceRunning(instance: NanobotChannelInstanceInfo): boolean {
  return instance.running === true || instance.runtime_status === 'running';
}

export function instanceStatusLabel(
  instance: NanobotChannelInstanceInfo,
  t: TFunction,
): string {
  if (instance.runtime_status === 'starting') return channelCopy(t, 'runtimeStarting', 'Starting');
  if (instance.runtime_status === 'failed') return channelCopy(t, 'runtimeFailed', 'Failed');
  if (instanceRunning(instance)) return channelCopy(t, 'filterOn', 'Running');
  if (!instance.configured) return channelCopy(t, 'authorizationRequired', 'Authorization required');
  if (instance.enabled) return channelCopy(t, 'enabled', 'Enabled');
  return channelCopy(t, 'filterOff', 'Not running');
}

export function instanceDisplayName(instance: NanobotChannelInstanceInfo): string {
  return instance.display_name?.trim() || instance.name.trim() || instance.id;
}

export function maskFeishuAppId(appId: string | undefined, t: TFunction): string {
  if (!appId) return channelCopy(t, 'appIdMissing', 'App ID not provided');
  if (appId.length <= 10) return appId;
  return `${appId.slice(0, 7)}...${appId.slice(-4)}`;
}
