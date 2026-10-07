import { StyleSheet } from 'react-native';

import type { Palette } from '@/ui/palette';

/**
 * 参考 OpenMuse 的轻底色分组、23px 圆角与 61px 列表行，而不是描边按钮网格。
 * 使用项目现有调色板适配明暗主题；图标底板与内容底色分离，保持柔和层级。
 */
export function createPreferencesStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    frame: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
    toolbar: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 32, gap: 22 },
    heading: { gap: 8, paddingBottom: 4 },
    title: { fontSize: 25, lineHeight: 34, fontWeight: '600', letterSpacing: -0.7, color: colors.foreground },
    description: { fontSize: 14, lineHeight: 22, color: colors.muted },
    section: { gap: 8 },
    sectionLabel: { marginLeft: 12, fontSize: 11, lineHeight: 17, color: colors.muted },
    group: { borderRadius: 23, backgroundColor: colors.pressed, paddingHorizontal: 16, overflow: 'hidden' },
    row: { minHeight: 61, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 10 },
    iconTile: { width: 29, height: 29, borderRadius: 7, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, fontSize: 15, lineHeight: 23, color: colors.foreground },
    value: { maxWidth: '44%', flexShrink: 1, fontSize: 13, lineHeight: 21, textAlign: 'right', color: colors.muted },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    pressed: { backgroundColor: colors.userBubble },
  });
}
