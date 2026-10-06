import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOCAL_PREFS, useLocalPreferencesStore } from '@/stores/local-preferences-store';

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(async () => undefined) }));
vi.mock('@/i18n/config', () => ({ normalizeLocale: (value: string) => value, resolveDeviceLocale: () => 'en' }));

describe('精简后的本地偏好兼容', () => {
  it('保留主题和语言，已移除的显示开关固定为聊天默认值', () => {
    useLocalPreferencesStore.getState().replace({
      theme: 'dark', language: 'zh-CN', density: 'compact', activityMode: 'expanded',
      codeWrap: false, brandLogos: true, fileEditDisplayMode: 'diff',
    });
    expect(useLocalPreferencesStore.getState().preferences).toEqual({
      ...DEFAULT_LOCAL_PREFS, theme: 'dark', language: 'zh-CN',
    });
  });
});
