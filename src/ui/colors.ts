import type { Palette } from './palette';

export const LIGHT_COLORS: Palette = {
  background: '#FCFCFB',
  foreground: '#23221F',
  muted: '#777570',
  subtle: '#A09E98',
  border: '#DDDCD8',
  card: '#FFFFFF',
  userBubble: '#EFEDEA',
  userText: '#2C2B28',
  accentSoft: '#C8E7FF',
  accentText: '#1473C8',
  pressed: '#EFEEEB',
  errorBackground: '#FBE9E6',
  errorText: '#A73A31',
};

export const DARK_COLORS: Palette = {
  background: '#171715',
  foreground: '#F0EFEC',
  muted: '#A9A7A1',
  subtle: '#77756F',
  border: '#3B3A36',
  card: '#222220',
  userBubble: '#302F2C',
  userText: '#F1F0ED',
  accentSoft: '#214A65',
  accentText: '#E7F4FF',
  pressed: '#2A2926',
  errorBackground: '#432520',
  errorText: '#F0A39B',
};

export function paletteForTheme(theme: 'light' | 'dark'): Palette {
  return theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}
