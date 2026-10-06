import { StyleSheet } from 'react-native';

export interface WorkspaceColors {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
  errorText: string;
}

export const styles = StyleSheet.create({
  disabled: { opacity: 0.48 },
  // 项目控件按内容占位，不再绘制满宽底条；窄 footer 中允许收缩，保留行内错误提示。
  projectControl: {
    minWidth: 0,
    maxWidth: '100%',
    alignSelf: 'flex-start',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 两个 chip 均保留至少 44 的触摸区域，文字较长时收缩截断而不是挤满 footer。
  projectTrigger: {
    minWidth: 44,
    minHeight: 44,
    maxWidth: 220,
    flexShrink: 1,
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  projectTriggerText: { minWidth: 0, flexShrink: 1, fontSize: 12, fontWeight: '500' },
  inlineError: { minWidth: 0, maxWidth: 160, flexShrink: 1, fontSize: 11, fontWeight: '600' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  // 弹窗以更宽松的留白、大圆角和轻阴影承载原有选项，不改变关闭或权限处理逻辑。
  projectDialog: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  dialogTitle: { fontSize: 16, fontWeight: '700' },
  dialogSubtitle: { marginTop: 4, fontSize: 11.5 },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  defaultProjectRow: { minHeight: 58, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  projectIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  projectBody: { minWidth: 0, flex: 1 },
  projectName: { fontSize: 13, fontWeight: '700' },
  projectPath: { marginTop: 2, fontSize: 11.5 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  fieldLabel: { marginBottom: 8, marginLeft: 2, fontSize: 11.5, fontWeight: '600' },
  pathForm: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pathInput: { minWidth: 0, flex: 1, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, paddingHorizontal: 12, fontSize: 12.5 },
  usePathButton: { minWidth: 44, height: 44, borderRadius: 22, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  usePathText: { fontSize: 12, fontWeight: '700' },
  dialogError: { marginTop: 8, marginHorizontal: 2, fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  // 权限入口只保留一套轻量 chip 样式，不再按首屏或会话布局切换高度。
  accessTrigger: {
    minWidth: 44,
    minHeight: 44,
    maxWidth: 165,
    alignSelf: 'flex-start',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  accessText: { minWidth: 0, flexShrink: 1, fontSize: 11.5, fontWeight: '500' },
  accessDialog: {
    width: 232,
    marginLeft: 16,
    marginBottom: 92,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: 10,
    gap: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  accessDialogTitle: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8, fontSize: 10.5, fontWeight: '700' },
  accessOption: { minHeight: 44, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  accessOptionIcon: { width: 22, alignItems: 'center' },
  accessOptionText: { minWidth: 0, flex: 1, fontSize: 13, fontWeight: '600' },
});
