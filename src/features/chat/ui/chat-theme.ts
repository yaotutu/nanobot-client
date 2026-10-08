import type { Palette } from '@/ui/palette';

/** 消息页独立的视觉规范：不修改登录、侧边栏和设置页的布局或配色。 */
const light: Palette = {
  background: '#FCFCFC', foreground: '#11191C', muted: '#697176', subtle: '#949B9F',
  border: '#EEEEF0', card: '#FFFFFF', userBubble: '#C8E7FF', userText: '#143348',
  accentSoft: '#C8E7FF', accentText: '#1473C8',
  pressed: '#EEEEF0', errorBackground: '#FBEFED', errorText: '#AA4A45',
};

const dark: Palette = {
  background: '#151B20', foreground: '#EEF3F6', muted: '#A2AFB8', subtle: '#73838F',
  border: '#2C363E', card: '#1C252C', userBubble: '#214A65', userText: '#E7F4FF',
  accentSoft: '#214A65', accentText: '#E7F4FF',
  pressed: '#242E36', errorBackground: '#3B272A', errorText: '#F3AAA4',
};

export const chatLayout = { maxWidth: 760, horizontalInset: 17, controlSize: 44 } as const;

export function chatPaletteForTheme(isDark: boolean): Palette {
  return isDark ? dark : light;
}
