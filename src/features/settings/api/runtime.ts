import { apiClient } from '@/services/api/api';
import type { SettingsPayload } from '@/types/api/settings/payload';
import type {
  ApiServicePayload,
  NetworkSafetySettingsUpdate,
} from '@/types/api/settings/runtime';

export async function fetchApiService(): Promise<ApiServicePayload> {
  return apiClient.get<ApiServicePayload>('/api/settings/api-service');
}

export async function startApiService(values: {
  host: string;
  port: number;
  timeout: number;
  apiKey?: string;
}): Promise<ApiServicePayload> {
  const query: Record<string, string> = {
    host: values.host,
    port: String(values.port),
    timeout: String(values.timeout),
  };
  const headers = values.apiKey !== undefined
    ? { 'X-Nanobot-API-Service-Values': JSON.stringify({ api_key: values.apiKey }) }
    : undefined;
  return apiClient.request<ApiServicePayload>(
    '/api/settings/api-service/start',
    { method: 'GET', query, headers },
  );
}

export async function stopApiService(): Promise<ApiServicePayload> {
  return apiClient.get<ApiServicePayload>('/api/settings/api-service/stop');
}

export async function updateNetworkSafetySettings(
  update: NetworkSafetySettingsUpdate,
): Promise<SettingsPayload> {
  return apiClient.request<SettingsPayload>(
    '/api/settings/network-safety/update',
    {
      method: 'GET',
      query: {
        webui_allow_local_service_access: String(update.webuiAllowLocalServiceAccess),
        webui_default_access_mode: update.webuiDefaultAccessMode,
      },
    },
  );
}
