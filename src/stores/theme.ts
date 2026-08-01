import { useMemo } from 'react';

import { paletteForTheme } from '@/ui/colors';
import type { Palette } from '@/ui/palette';
import { useLocalPreferencesStore, selectTheme } from './local-preferences-store';

/** 当前主题派生出的颜色调色板。订阅 local-preferences 的 theme 字段。 */
export function useThemePalette(): { theme: 'light' | 'dark'; colors: Palette } {
  const theme = useLocalPreferencesStore(selectTheme);
  return useMemo(() => ({ theme, colors: paletteForTheme(theme) }), [theme]);
}
