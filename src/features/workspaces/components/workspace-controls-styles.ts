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
  projectBar: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  projectTrigger: {
    minWidth: 0,
    maxWidth: 250,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  projectTriggerText: { minWidth: 0, flexShrink: 1, fontSize: 12, fontWeight: '500' },
  inlineError: { minWidth: 0, flex: 1, fontSize: 11, fontWeight: '600' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  projectDialog: {
    marginHorizontal: 12,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  dialogTitle: { fontSize: 16, fontWeight: '700' },
  dialogSubtitle: { marginTop: 3, fontSize: 11.5 },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  defaultProjectRow: { minHeight: 58, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  projectIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  projectBody: { minWidth: 0, flex: 1 },
  projectName: { fontSize: 13, fontWeight: '700' },
  projectPath: { marginTop: 2, fontSize: 11.5 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 11 },
  fieldLabel: { marginBottom: 7, marginLeft: 2, fontSize: 11.5, fontWeight: '600' },
  pathForm: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pathInput: { minWidth: 0, flex: 1, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, fontSize: 12.5 },
  usePathButton: { height: 40, borderRadius: 20, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  usePathText: { fontSize: 12, fontWeight: '700' },
  dialogError: { marginTop: 8, marginHorizontal: 2, fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  accessTrigger: { minWidth: 0, maxWidth: 165, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 7 },
  accessTriggerHero: { height: 32 },
  accessTriggerThread: { height: 34 },
  accessText: { minWidth: 0, flexShrink: 1, fontSize: 11.5, fontWeight: '600' },
  accessDialog: {
    width: 232,
    marginLeft: 12,
    marginBottom: 92,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 7,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.17,
    shadowRadius: 20,
    elevation: 11,
  },
  accessDialogTitle: { paddingHorizontal: 9, paddingTop: 6, paddingBottom: 5, fontSize: 10.5, fontWeight: '700' },
  accessOption: { minHeight: 44, borderRadius: 12, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  accessOptionIcon: { width: 22, alignItems: 'center' },
  accessOptionText: { minWidth: 0, flex: 1, fontSize: 13, fontWeight: '600' },
});
