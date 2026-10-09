import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THEME_ID,
  resolveAppPalette,
  resolveChatPalette,
  resolveThemeDefinition,
  themeModeForDark,
} from '@/features/theme';

describe('theme resolver', () => {
  it('分别返回 nanobot 全局界面和聊天界面的明暗调色板', () => {
    expect(resolveAppPalette('nanobot', 'light')).toMatchObject({
      background: '#FCFCFB',
      card: '#FFFFFF',
    });
    expect(resolveAppPalette('nanobot', 'dark')).toMatchObject({
      background: '#171715',
      card: '#222220',
    });

    // 聊天色保持独立，后续主题不能误改全局设置页，反之亦然。
    expect(resolveChatPalette('nanobot', 'light')).toMatchObject({
      background: '#FCFCFC',
      userBubble: '#C8E7FF',
    });
    expect(resolveChatPalette('nanobot', 'dark')).toMatchObject({
      background: '#151B20',
      userBubble: '#214A65',
    });
  });

  it('把 dark 布尔值转换为主题模式，并对未知主题 ID 回落到 nanobot', () => {
    expect(themeModeForDark(false)).toBe('light');
    expect(themeModeForDark(true)).toBe('dark');
    expect(resolveThemeDefinition('unknown').id).toBe(DEFAULT_THEME_ID);
  });
});
