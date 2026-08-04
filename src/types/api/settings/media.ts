export interface WebSearchProviderInfo {
  name: string;
  label: string;
  credential: 'none' | 'api_key' | 'optional_api_key' | 'base_url';
}

export interface ImageProviderInfo {
  name: string;
  label: string;
  configured: boolean;
  auth_type?: 'api_key' | 'oauth';
  api_key_hint?: string | null;
  api_base?: string | null;
  default_api_base?: string | null;
  models?: string[];
  default_model?: string | null;
}

export interface TranscriptionProviderInfo {
  name: string;
  label: string;
  configured: boolean;
  api_key_hint?: string | null;
  api_base?: string | null;
  default_api_base?: string | null;
}

export interface WebSearchSettingsUpdate {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  maxResults?: number;
  timeout?: number;
  useJinaReader?: boolean;
}

export interface ImageGenerationSettingsUpdate {
  enabled: boolean;
  provider: string;
  model: string;
  defaultAspectRatio: string;
  defaultImageSize: string;
  maxImagesPerTurn: number;
}

export interface TranscriptionSettingsUpdate {
  enabled: boolean;
  provider: string;
  model: string;
  language: string;
  maxDurationSec: number;
  maxUploadMb: number;
}
