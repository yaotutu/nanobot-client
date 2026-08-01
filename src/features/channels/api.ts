import { apiClient } from '@/services/api';
import type {
  ChannelConfigurePayload,
  ChannelConnectPayload,
  ChannelValidationPayload,
  NanobotFeaturesPayload,
  PairingPayload,
} from '@/types/api';

export async function fetchNanobotFeatures(): Promise<NanobotFeaturesPayload> {
  return apiClient.get<NanobotFeaturesPayload>('/api/settings/nanobot-features');
}

export async function setNanobotFeatureEnabled(
  action: 'enable' | 'disable',
  name: string,
  instanceId?: string,
): Promise<NanobotFeaturesPayload> {
  return apiClient.request<NanobotFeaturesPayload>(
    `/api/settings/nanobot-features/${action}`,
    { method: 'GET', query: { name, ...(instanceId ? { instance_id: instanceId } : {}) } },
  );
}

export async function configureChannel(
  name: string,
  values: Record<string, string>,
  options: { enable?: boolean; instanceId?: string } = {},
): Promise<ChannelConfigurePayload> {
  const query: Record<string, string> = { name };
  if (options.enable !== undefined) query.enable = String(options.enable);
  if (options.instanceId) query.instance_id = options.instanceId;
  return apiClient.request<ChannelConfigurePayload>(
    '/api/settings/channels/configure',
    { method: 'GET', query, headers: { 'X-Nanobot-Channel-Values': JSON.stringify(values) } },
  );
}

export async function validateChannel(
  name: string,
  values: Record<string, string>,
  instanceId?: string,
): Promise<ChannelValidationPayload> {
  const query: Record<string, string> = { name };
  if (instanceId) query.instance_id = instanceId;
  return apiClient.request<ChannelValidationPayload>(
    '/api/settings/channels/validate',
    { method: 'GET', query, headers: { 'X-Nanobot-Channel-Values': JSON.stringify(values) } },
  );
}

export async function startChannelConnect(
  channel: string,
  options: {
    domain?: string;
    instanceId?: string;
    mode?: 'replace' | 'create';
    force?: boolean;
  } = {},
): Promise<ChannelConnectPayload> {
  const query: Record<string, string> = {};
  if (options.domain) query.domain = options.domain;
  if (options.instanceId) query.instance_id = options.instanceId;
  if (options.mode) query.mode = options.mode;
  if (options.force) query.force = 'true';
  return apiClient.request<ChannelConnectPayload>(
    `/api/settings/channels/${encodeURIComponent(channel)}/connect/start`,
    { method: 'GET', query },
  );
}

export async function pollChannelConnect(
  channel: string,
  sessionId: string,
): Promise<ChannelConnectPayload> {
  return apiClient.get<ChannelConnectPayload>(
    `/api/settings/channels/${encodeURIComponent(channel)}/connect/poll`,
    { session_id: sessionId },
  );
}

export async function cancelChannelConnect(
  channel: string,
  sessionId: string,
): Promise<ChannelConnectPayload> {
  return apiClient.get<ChannelConnectPayload>(
    `/api/settings/channels/${encodeURIComponent(channel)}/connect/cancel`,
    { session_id: sessionId },
  );
}

export async function fetchPairingRequests(): Promise<PairingPayload> {
  return apiClient.get<PairingPayload>('/api/settings/pairing');
}

export async function runPairingAction(
  action: 'approve' | 'deny',
  code: string,
): Promise<PairingPayload> {
  return apiClient.get<PairingPayload>(`/api/settings/pairing/${action}`, { code });
}
