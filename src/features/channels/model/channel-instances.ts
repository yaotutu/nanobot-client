import type {
  NanobotChannelInstanceInfo,
  NanobotFeatureInfo,
} from '@/types/api/nanobot-features';

export function channelInstances(
  feature: NanobotFeatureInfo,
): NanobotChannelInstanceInfo[] {
  if (feature.name === 'feishu' && !feature.instances?.length) {
    return [{
      id: 'default',
      name: 'nanobot',
      enabled: feature.enabled,
      running: feature.running,
      runtime_status: feature.runtime_status,
      runtime_error: feature.runtime_error,
      configured: Boolean(feature.configured),
      config_values: feature.config_values ?? {},
      configured_fields: feature.configured_fields ?? [],
    }];
  }
  return feature.instances ?? [];
}

export function resolveSelectedInstanceId(
  instances: NanobotChannelInstanceInfo[],
  selectedInstanceId: string | undefined,
): string | undefined {
  return instances.some((instance) => instance.id === selectedInstanceId)
    ? selectedInstanceId
    : instances[0]?.id;
}
