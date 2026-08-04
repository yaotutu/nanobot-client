import { apiClient } from '@/services/api/api';
import type {
  ProviderOAuthCompletionResult,
  ProviderOAuthLoginResult,
} from '@/types/api/settings/oauth';
import type { SettingsPayload } from '@/types/api/settings/payload';
import type {
  ProviderCreationUpdate,
  ProviderSettingsUpdate,
} from '@/types/api/settings/providers';

export async function updateProviderSettings(
  update: ProviderSettingsUpdate,
): Promise<SettingsPayload> {
  const { provider, ...values } = update;
  return apiClient.request<SettingsPayload>(
    '/api/settings/provider/update',
    {
      method: 'GET',
      query: { provider },
      headers: { 'X-Nanobot-Provider-Values': encodeURIComponent(JSON.stringify(values)) },
    },
  );
}

export async function createProviderSettings(
  update: ProviderCreationUpdate,
): Promise<SettingsPayload> {
  return apiClient.request<SettingsPayload>(
    '/api/settings/provider/create',
    {
      method: 'GET',
      headers: { 'X-Nanobot-Provider-Values': encodeURIComponent(JSON.stringify(update)) },
    },
  );
}

export async function loginProviderOAuth(provider: string): Promise<ProviderOAuthLoginResult> {
  return apiClient.request<ProviderOAuthLoginResult>(
    '/api/settings/provider/oauth-login',
    { method: 'GET', query: { provider } },
  );
}

export async function completeProviderOAuth(
  provider: string,
  flowId: string,
  authorizationCode?: string,
): Promise<ProviderOAuthCompletionResult> {
  const query: Record<string, string> = { provider, flow_id: flowId };
  const headers = authorizationCode ? { 'X-Nanobot-OAuth-Code': authorizationCode } : undefined;
  return apiClient.request<ProviderOAuthCompletionResult>(
    '/api/settings/provider/oauth-login/complete',
    { method: 'GET', query, headers },
  );
}

export async function logoutProviderOAuth(provider: string): Promise<SettingsPayload> {
  return apiClient.get<SettingsPayload>('/api/settings/provider/oauth-logout', { provider });
}
