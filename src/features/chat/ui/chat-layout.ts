/**
 * 聊天页唯一的布局尺寸来源。
 *
 * 这些值属于结构而非颜色，必须与主题拆开；自定义主题不允许修改头部高度、
 * 消息宽度或控件尺寸，避免视觉主题破坏可用性。
 */
export const chatLayout = {
  maxWidth: 760,
  horizontalInset: 14,
  controlSize: 44,
  headerHeight: 104,
} as const;
