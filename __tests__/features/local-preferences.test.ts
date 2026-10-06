import * as SecureStore from 'expo-secure-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOCAL_PREFS, useLocalPreferencesStore } from '@/stores/local-preferences-store';
import type { LocalPreferences } from '@/stores/local-preferences-store';

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(async () => undefined) }));
// 只固定设备语言，保留真实的 normalizeLocale，避免 mock 掩盖无效语言的规范化行为。
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en' }] }));

const storageKey = 'nanobot-native.local-preferences';

// 同时检查内存和写入内容，确保更新后的持久化对象严格只有主题与语言。
const expectPersistedPreferences = (preferences: LocalPreferences) => {
  expect(useLocalPreferencesStore.getState().preferences).toEqual(preferences);
  expect(useLocalPreferencesStore.getState().hydrated).toBe(true);
  expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(storageKey, JSON.stringify(preferences));
};

describe('本地主题与语言偏好', () => {
  beforeEach(() => {
    // 每例恢复同一初始状态，并重置存储 mock，避免上一例的更新或读取结果干扰断言。
    vi.resetAllMocks();
    vi.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
    useLocalPreferencesStore.setState({ preferences: DEFAULT_LOCAL_PREFS, hydrated: false });
  });

  it('默认偏好仅包含主题与设备语言', () => {
    expect(DEFAULT_LOCAL_PREFS).toEqual({ theme: 'light', language: 'en' });
  });

  it('替换主题与语言并写入现有存储 key', () => {
    const preferences: LocalPreferences = { theme: 'dark', language: 'zh-CN' };
    useLocalPreferencesStore.getState().replace(preferences);
    expectPersistedPreferences(preferences);
  });

  it('分别更新主题与语言时保留另一项', () => {
    useLocalPreferencesStore.getState().update({ theme: 'dark' });
    expectPersistedPreferences({ theme: 'dark', language: 'en' });

    useLocalPreferencesStore.getState().update({ language: 'zh-TW' });
    expectPersistedPreferences({ theme: 'dark', language: 'zh-TW' });
  });

  it('空更新保持当前主题与语言', () => {
    useLocalPreferencesStore.getState().replace({ theme: 'dark', language: 'ja' });
    useLocalPreferencesStore.getState().update({});
    expectPersistedPreferences({ theme: 'dark', language: 'ja' });
  });

  it('无效主题与语言规范化为默认值', () => {
    // 强制转换仅用于模拟运行时无效输入，不放宽生产接口的主题和语言类型约束。
    useLocalPreferencesStore.getState().update({
      theme: 'invalid', language: 'unsupported',
    } as unknown as Partial<LocalPreferences>);
    expectPersistedPreferences({ theme: 'light', language: 'en' });
  });

  it('语言区域值由真实规范化逻辑转换为受支持语言', () => {
    useLocalPreferencesStore.getState().replace({
      theme: 'dark', language: ' fr-FR ',
    } as unknown as LocalPreferences);
    expectPersistedPreferences({ theme: 'dark', language: 'fr' });
  });

  it('从现有存储 key 读取当前主题与语言', async () => {
    const preferences: LocalPreferences = { theme: 'dark', language: 'ko' };
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(preferences));

    await useLocalPreferencesStore.getState().hydrate();

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(storageKey);
    expect(useLocalPreferencesStore.getState().preferences).toEqual(preferences);
    expect(useLocalPreferencesStore.getState().hydrated).toBe(true);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it.each([null, '{', 'null', '[]', '{}', '{"theme":"invalid","language":"unsupported"}'])(
    '安全处理空存储或无效内容 %s',
    async (raw) => {
      // 覆盖缺失数据、JSON 解析失败和非法偏好值；读取失败仍完成初始化且不回写存储。
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(raw);
      await useLocalPreferencesStore.getState().hydrate();

      expect(useLocalPreferencesStore.getState().preferences).toEqual(DEFAULT_LOCAL_PREFS);
      expect(useLocalPreferencesStore.getState().hydrated).toBe(true);
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    },
  );
});
