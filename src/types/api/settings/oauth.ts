import type { SettingsPayload } from './payload';

export interface ProviderOAuthAuthorizationRequired {
  status: 'authorization_required';
  provider: string;
  flow_id: string;
  authorization_url: string;
  expires_in: number;
}

export interface ProviderOAuthPending {
  status: 'pending';
  provider: string;
  flow_id: string;
}

export type ProviderOAuthLoginResult = SettingsPayload | ProviderOAuthAuthorizationRequired;
export type ProviderOAuthCompletionResult = SettingsPayload | ProviderOAuthPending;
