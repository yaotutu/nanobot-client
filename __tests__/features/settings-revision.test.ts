import { describe, expect, it } from 'vitest';

import {
  imageSettingsRevisionKey,
  modelSettingsRevisionKey,
  runtimeSettingsRevisionKey,
  securitySettingsRevisionKey,
  voiceSettingsRevisionKey,
  webSettingsRevisionKey,
} from '@/features/settings/model/settings-revision';
import type { SettingsPayload } from '@/types/api/settings';

function settingsFixture(): SettingsPayload {
  return {
    agent: {
      model: 'gpt-test',
      provider: 'openai',
      resolved_provider: 'openai',
      model_preset: 'default',
      max_tokens: 4096,
      context_window_tokens: 16_384,
      temperature: 0.5,
      reasoning_effort: 'medium',
      timezone: 'UTC',
      bot_name: 'Nano',
      bot_icon: '🤖',
    },
    model_presets: [{
      name: 'default',
      label: 'Default',
      active: true,
      is_default: false,
      model: 'gpt-test',
      provider: 'openai',
      max_tokens: 4096,
      context_window_tokens: 16_384,
      temperature: 0.5,
      reasoning_effort: 'medium',
    }],
    model_call_order: ['default'],
    model_call_order_editable: true,
    providers: [{
      name: 'openai',
      label: 'OpenAI',
      configured: true,
      api_base: 'https://example.test',
    }],
    image_generation: {
      enabled: true,
      provider: 'openai',
      model: 'image-1',
      default_aspect_ratio: '1:1',
      default_image_size: '1K',
      max_images_per_turn: 1,
      save_dir: '/tmp/images',
      providers: [],
    },
    transcription: {
      enabled: true,
      provider: 'openai',
      provider_configured: true,
      model: 'whisper-1',
      language: null,
      max_duration_sec: 120,
      max_upload_mb: 25,
      providers: [],
    },
    web_search: {
      provider: 'brave',
      max_results: 5,
      timeout: 30,
      providers: [],
    },
    web: {
      enable: true,
      search: { max_results: 5, timeout: 30 },
      fetch: { use_jina_reader: false },
    },
    advanced: {
      restrict_to_workspace: true,
      ssrf_whitelist_count: 0,
      webui_allow_local_service_access: false,
      webui_default_access_mode: 'default',
      private_service_protection_enabled: true,
      mcp_server_count: 0,
      exec_enabled: false,
      exec_path_prepend_set: false,
      exec_path_append_set: false,
    },
    runtime: {
      config_path: '/tmp/config',
      workspace_path: '/tmp/workspace',
      gateway_host: '127.0.0.1',
      gateway_port: 8765,
      heartbeat: {
        enabled: true,
        interval_s: 60,
        keep_recent_messages: 10,
      },
      dream: { schedule: '0 3 * * *' },
      unified_session: false,
    },
    requires_restart: false,
  } as unknown as SettingsPayload;
}

function changed(
  key: (settings: SettingsPayload) => string,
  mutate: (settings: SettingsPayload) => void,
): boolean {
  const before = settingsFixture();
  const after = settingsFixture();
  mutate(after);
  return key(before) !== key(after);
}

describe('settings revision keys', () => {
  it('tracks complete model form inputs', () => {
    expect(changed(modelSettingsRevisionKey, (settings) => {
      settings.model_presets[0].temperature = 0.9;
    })).toBe(true);
    expect(changed(modelSettingsRevisionKey, (settings) => {
      settings.providers[0].proxy = 'http://proxy.test';
    })).toBe(true);
    expect(changed(modelSettingsRevisionKey, (settings) => {
      settings.model_call_order_editable = false;
    })).toBe(true);
  });

  it('tracks image, voice, web, runtime, and security form inputs', () => {
    expect(changed(imageSettingsRevisionKey, (settings) => {
      settings.image_generation.default_aspect_ratio = '16:9';
    })).toBe(true);
    expect(changed(voiceSettingsRevisionKey, (settings) => {
      settings.transcription!.max_upload_mb = 30;
    })).toBe(true);
    expect(changed(webSettingsRevisionKey, (settings) => {
      settings.web.fetch.use_jina_reader = true;
    })).toBe(true);
    expect(changed(runtimeSettingsRevisionKey, (settings) => {
      settings.agent.timezone = 'Asia/Shanghai';
    })).toBe(true);
    expect(changed(securitySettingsRevisionKey, (settings) => {
      settings.advanced.webui_default_access_mode = 'full';
    })).toBe(true);
  });

  it('ignores unrelated payload changes', () => {
    const keys = [
      modelSettingsRevisionKey,
      imageSettingsRevisionKey,
      voiceSettingsRevisionKey,
      webSettingsRevisionKey,
      runtimeSettingsRevisionKey,
      securitySettingsRevisionKey,
    ];
    for (const key of keys) {
      expect(changed(key, (settings) => {
        settings.requires_restart = true;
      })).toBe(false);
    }
  });
});
