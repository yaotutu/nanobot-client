import { apiClient } from '@/services/api/api';
import type { RequestOptions } from '@/services/api/api-client';
import type { SettingsPayload } from '@/types/api/settings/payload';
import type { SettingsUpdate } from '@/types/api/settings/updates';

export async function fetchSettings(
  options?: Pick<RequestOptions, 'signal'>,
): Promise<SettingsPayload> {
  return apiClient.get<SettingsPayload>('/api/settings', undefined, options);
}

export async function updateSettings(update: SettingsUpdate): Promise<SettingsPayload> {
  const query: Record<string, string> = {};
  if (update.modelPreset !== undefined) query.model_preset = update.modelPreset ?? 'default';
  if (update.model !== undefined) query.model = update.model;
  if (update.provider !== undefined) query.provider = update.provider;
  if (update.contextWindowTokens !== undefined) {
    query.context_window_tokens = String(update.contextWindowTokens);
  }
  if (update.timezone !== undefined) query.timezone = update.timezone;
  if (update.botName !== undefined) query.bot_name = update.botName;
  if (update.botIcon !== undefined) query.bot_icon = update.botIcon;
  if (update.toolHintMaxLength !== undefined) {
    query.tool_hint_max_length = String(update.toolHintMaxLength);
  }
  return apiClient.request<SettingsPayload>('/api/settings/update', { method: 'GET', query });
}
