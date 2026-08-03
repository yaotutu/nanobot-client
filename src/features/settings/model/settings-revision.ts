import type { SettingsPayload } from '@/types/api/settings';

function revisionKey(value: unknown): string {
  return JSON.stringify(value);
}

export function modelSettingsRevisionKey(settings: SettingsPayload): string {
  return revisionKey({
    agent: {
      model: settings.agent.model,
      provider: settings.agent.provider,
      resolvedProvider: settings.agent.resolved_provider,
      modelPreset: settings.agent.model_preset,
      maxTokens: settings.agent.max_tokens,
      contextWindowTokens: settings.agent.context_window_tokens,
      temperature: settings.agent.temperature,
      reasoningEffort: settings.agent.reasoning_effort,
    },
    callOrder: settings.model_call_order,
    callOrderEditable: settings.model_call_order_editable,
    presets: settings.model_presets,
    providers: settings.providers,
  });
}

export function imageSettingsRevisionKey(settings: SettingsPayload): string {
  return revisionKey(settings.image_generation);
}

export function voiceSettingsRevisionKey(settings: SettingsPayload): string {
  return revisionKey(settings.transcription ?? null);
}

export function webSettingsRevisionKey(settings: SettingsPayload): string {
  return revisionKey({
    search: settings.web_search,
    useJinaReader: settings.web.fetch.use_jina_reader,
  });
}

export function runtimeSettingsRevisionKey(settings: SettingsPayload): string {
  return revisionKey({
    botName: settings.agent.bot_name,
    botIcon: settings.agent.bot_icon,
    timezone: settings.agent.timezone,
  });
}

export function securitySettingsRevisionKey(settings: SettingsPayload): string {
  const advanced = settings.advanced;
  return revisionKey({
    allowLocalServiceAccess:
      advanced.webui_allow_local_service_access
      ?? advanced.allow_local_preview_access
      ?? true,
    defaultAccessMode: advanced.webui_default_access_mode,
  });
}
