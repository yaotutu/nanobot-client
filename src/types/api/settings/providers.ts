import type { ProviderModelsPayload } from './models';

export type ProviderAdvancedField =
  | 'api_type'
  | 'extra_headers'
  | 'extra_body'
  | 'extra_query'
  | 'proxy'
  | 'thinking_style'
  | 'region'
  | 'profile';

export interface ProviderSettingsInfo {
  name: string;
  label: string;
  is_custom?: boolean;
  configured: boolean;
  auth_type?: 'api_key' | 'oauth';
  api_key_required?: boolean;
  api_key_hint?: string | null;
  api_base?: string | null;
  default_api_base?: string | null;
  model_selectable?: boolean;
  model_catalog?: ProviderModelsPayload['catalog_kind'];
  api_type?: 'auto' | 'chat_completions' | 'responses';
  oauth_account?: string | null;
  oauth_expires_at?: number | null;
  oauth_login_supported?: boolean;
  proxy?: string | null;
  advanced_fields?: ProviderAdvancedField[];
  extra_headers?: Record<string, string> | null;
  extra_body?: Record<string, unknown> | null;
  extra_query?: Record<string, string> | null;
  thinking_style?: string | null;
  region?: string | null;
  profile?: string | null;
}

export interface ProviderSettingsUpdate {
  provider: string;
  displayName?: string;
  apiKey?: string;
  apiBase?: string;
  apiType?: 'auto' | 'chat_completions' | 'responses';
  proxy?: string;
  extraHeaders?: string;
  extraBody?: string;
  extraQuery?: string;
  thinkingStyle?: string;
  region?: string;
  profile?: string;
}

export interface ProviderCreationUpdate {
  name: string;
  apiKey?: string;
  apiBase: string;
  proxy?: string;
  extraHeaders?: string;
  extraBody?: string;
  extraQuery?: string;
  thinkingStyle?: string;
}
