import { apiClient } from '@/services/api/api';
import type {
  ImageGenerationSettingsUpdate,
  TranscriptionSettingsUpdate,
  WebSearchSettingsUpdate,
} from '@/types/api/settings/media';
import type { SettingsPayload } from '@/types/api/settings/payload';

export async function updateWebSearchSettings(
  update: WebSearchSettingsUpdate,
): Promise<SettingsPayload> {
  const query: Record<string, string> = { provider: update.provider };
  if (update.apiKey !== undefined) query.api_key = update.apiKey;
  if (update.baseUrl !== undefined) query.base_url = update.baseUrl;
  if (update.maxResults !== undefined) query.max_results = String(update.maxResults);
  if (update.timeout !== undefined) query.timeout = String(update.timeout);
  if (update.useJinaReader !== undefined) query.use_jina_reader = String(update.useJinaReader);
  return apiClient.request<SettingsPayload>(
    '/api/settings/web-search/update',
    { method: 'GET', query },
  );
}

export async function updateImageGenerationSettings(
  update: ImageGenerationSettingsUpdate,
): Promise<SettingsPayload> {
  const query: Record<string, string> = {
    enabled: String(update.enabled),
    provider: update.provider,
    model: update.model,
    default_aspect_ratio: update.defaultAspectRatio,
    default_image_size: update.defaultImageSize,
    max_images_per_turn: String(update.maxImagesPerTurn),
  };
  return apiClient.request<SettingsPayload>(
    '/api/settings/image-generation/update',
    { method: 'GET', query },
  );
}

export async function updateTranscriptionSettings(
  update: TranscriptionSettingsUpdate,
): Promise<SettingsPayload> {
  const query: Record<string, string> = {
    enabled: String(update.enabled),
    provider: update.provider,
    model: update.model,
    language: update.language,
    max_duration_sec: String(update.maxDurationSec),
    max_upload_mb: String(update.maxUploadMb),
  };
  return apiClient.request<SettingsPayload>(
    '/api/settings/transcription/update',
    { method: 'GET', query },
  );
}
