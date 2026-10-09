/**
 * 唯一 Palette 类型。所有屏幕/组件统一引用这一份，删除原本散落在 7 个文件里的副本。
 *
 * 颜色由 `@/features/theme` 统一解析；这里只保留类型契约。
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
  // 轻量动作区使用的柔和强调色；避免各组件自行判断明暗主题。
  accentSoft: string;
  accentText: string;
  pressed: string;
  errorBackground: string;
  errorText: string;
}
