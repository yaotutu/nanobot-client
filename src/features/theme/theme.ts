import type { Palette } from '@/ui/palette';
import type { AppTheme } from '@/types/domain';

/**
 * 主题“模式”沿用本地偏好里的明暗值，避免业务层出现第二套模式定义。
 * 后续增加内置主题时，模式与主题 ID 是两个独立维度。
 */
export type ThemeMode = AppTheme;

/** 第一阶段只有 nanobot 内置主题；新增主题时扩展这个联合类型。 */
export type ThemeId = 'nanobot';

/** 明暗两套 Palette 的最小结构，供全局界面和聊天界面分别使用。 */
export interface ThemePalettePair {
  light: Palette;
  dark: Palette;
}

/**
 * 一个主题必须同时声明全局界面与聊天界面配色。
 *
 * 这里刻意不包含字体、间距、头部高度等布局信息：主题只负责颜色，
 * 避免用户主题破坏组件结构或导致测试维度失控。
 */
export interface ThemeDefinition {
  id: ThemeId;
  app: ThemePalettePair;
  chat: ThemePalettePair;
}

/** 默认主题 ID；当传入未知主题时用于兜底，保证应用始终有可用颜色。 */
export const DEFAULT_THEME_ID: ThemeId = 'nanobot';

// 全局界面沿用原有暖白/深灰基础色，只做位置迁移，不改变任何取值。
const APP_LIGHT_COLORS: Palette = {
  background: '#FCFCFB', foreground: '#23221F', muted: '#777570', subtle: '#A09E98',
  border: '#DDDCD8', card: '#FFFFFF', userBubble: '#EFEDEA', userText: '#2C2B28',
  accentSoft: '#C8E7FF', accentText: '#1473C8', pressed: '#EFEEEB',
  errorBackground: '#FBE9E6', errorText: '#A73A31',
};

const APP_DARK_COLORS: Palette = {
  background: '#171715', foreground: '#F0EFEC', muted: '#A9A7A1', subtle: '#77756F',
  border: '#3B3A36', card: '#222220', userBubble: '#302F2C', userText: '#F1F0ED',
  accentSoft: '#214A65', accentText: '#E7F4FF', pressed: '#2A2926',
  errorBackground: '#432520', errorText: '#F0A39B',
};

// 聊天页保留 nanobot 冷色体系；它从布局文件中拆出，后续主题可整体替换这一组颜色。
const CHAT_LIGHT_COLORS: Palette = {
  background: '#FCFCFC', foreground: '#11191C', muted: '#697176', subtle: '#949B9F',
  border: '#EEEEF0', card: '#FFFFFF', userBubble: '#C8E7FF', userText: '#143348',
  accentSoft: '#C8E7FF', accentText: '#1473C8',
  pressed: '#EEEEF0', errorBackground: '#FBEFED', errorText: '#AA4A45',
};

const CHAT_DARK_COLORS: Palette = {
  background: '#151B20', foreground: '#EEF3F6', muted: '#A2AFB8', subtle: '#73838F',
  border: '#2C363E', card: '#1C252C', userBubble: '#214A65', userText: '#E7F4FF',
  accentSoft: '#214A65', accentText: '#E7F4FF',
  pressed: '#242E36', errorBackground: '#3B272A', errorText: '#F3AAA4',
};

const NANOBOT_THEME: ThemeDefinition = {
  id: 'nanobot',
  app: { light: APP_LIGHT_COLORS, dark: APP_DARK_COLORS },
  chat: { light: CHAT_LIGHT_COLORS, dark: CHAT_DARK_COLORS },
};

// 内置主题注册表是唯一来源；后续设置页从这里枚举可选主题。
const BUILTIN_THEMES: readonly ThemeDefinition[] = [NANOBOT_THEME];

/** 将既有组件里的 dark 布尔值转换为主题模式，避免调用处散落三目表达式。 */
export const themeModeForDark = (dark: boolean): ThemeMode => (dark ? 'dark' : 'light');

/** 解析主题定义；未知 ID 回落到 nanobot，防止损坏的持久化数据导致无色可用。 */
export const resolveThemeDefinition = (themeId: string): ThemeDefinition =>
  BUILTIN_THEMES.find((theme) => theme.id === themeId) ?? NANOBOT_THEME;

/** 解析登录、设置、侧边栏等全局界面颜色。 */
export const resolveAppPalette = (themeId: string, mode: ThemeMode): Palette =>
  resolveThemeDefinition(themeId).app[mode];

/** 解析聊天页、会话抽屉和聊天相关弹窗颜色。 */
export const resolveChatPalette = (themeId: string, mode: ThemeMode): Palette =>
  resolveThemeDefinition(themeId).chat[mode];
