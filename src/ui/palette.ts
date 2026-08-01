/**
 * 唯一 Palette 类型。所有屏幕/组件统一引用这一份，删除原本散落在 7 个文件里的副本。
 *
 * 颜色取值见 `@/ui/colors.ts` 中的 `LIGHT_COLORS` / `DARK_COLORS`。
 */
export interface Palette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  userBubble: string;
  userText: string;
  pressed: string;
  errorBackground: string;
  errorText: string;
}
