import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Database from 'lucide-react-native/icons/database';
import Server from 'lucide-react-native/icons/server';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Palette } from '@/ui/palette';

import type { CustomMcpForm, CustomMcpMode } from '@/features/capabilities/model';

export function CustomMcpPanel({
  actionKey,
  advancedOpen,
  colors,
  configImport,
  form,
  mode,
  onAdvancedChange,
  onConfigImportChange,
  onFormChange,
  onImport,
  onModeChange,
  onSave,
}: {
  actionKey: string | null;
  advancedOpen: boolean;
  colors: Palette;
  configImport: string;
  form: CustomMcpForm;
  mode: CustomMcpMode;
  onAdvancedChange: (open: boolean) => void;
  onConfigImportChange: (value: string) => void;
  onFormChange: (form: CustomMcpForm) => void;
  onImport: () => void;
  onModeChange: (mode: CustomMcpMode) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const remote = form.transport !== 'stdio';
  const customBusy = actionKey?.startsWith('custom:') ?? false;
  const importBusy = actionKey === 'import';
  const actionsDisabled = actionKey !== null;
  const canSave = Boolean(form.name.trim()) && (remote ? Boolean(form.url.trim()) : Boolean(form.command.trim()));
  const update = <K extends keyof CustomMcpForm>(key: K, value: CustomMcpForm[K]) => {
    onFormChange({ ...form, [key]: value });
  };
  return (
    <View style={[styles.customPanel, { backgroundColor: colors.card }]}>
      <View style={styles.customHeader}>
        <View style={[styles.customIcon, { backgroundColor: colors.background }]}>
          <Server color={colors.muted} size={17} strokeWidth={1.8} />
        </View>
        <View style={styles.customHeaderCopy}>
          <Text style={[styles.customTitle, { color: colors.foreground }]}>{t('settings.mcp.customTitle', { defaultValue: 'Custom MCP Preset' })}</Text>
          <Text numberOfLines={2} style={[styles.customSubtitle, { color: colors.muted }]}>{t('settings.mcp.moreOptionsSubtitle')}</Text>
        </View>
      </View>
      <View style={styles.customModeRow}>
        <Pressable
          accessibilityLabel={t('settings.mcp.customTitle')}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'custom' }}
          onPress={() => onModeChange(mode === 'custom' ? null : 'custom')}
          style={[
            styles.customModeButton,
            {
              backgroundColor: mode === 'custom' ? colors.foreground : colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <Server color={mode === 'custom' ? colors.background : colors.muted} size={14} />
          <Text style={[styles.customModeText, { color: mode === 'custom' ? colors.background : colors.muted }]}>{t('settings.mcp.customAction')}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={t('settings.mcp.importConfig')}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'import' }}
          onPress={() => onModeChange(mode === 'import' ? null : 'import')}
          style={[
            styles.customModeButton,
            {
              backgroundColor: mode === 'import' ? colors.foreground : colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <Database color={mode === 'import' ? colors.background : colors.muted} size={14} />
          <Text style={[styles.customModeText, { color: mode === 'import' ? colors.background : colors.muted }]}>{t('settings.mcp.importConfig')}</Text>
        </Pressable>
      </View>

      {mode === 'custom' ? (
        <View style={[styles.customBody, { borderTopColor: colors.border }]}>
          <FieldLabel colors={colors} label={t('settings.mcp.serverName')}>
            <TextInput
              accessibilityLabel={t('settings.mcp.serverName')}
              autoCapitalize="none"
              onChangeText={(value) => update('name', value)}
              placeholder="docs"
              placeholderTextColor={colors.subtle}
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={form.name}
            />
          </FieldLabel>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t('settings.mcp.transport')}</Text>
          <View style={[styles.transportSegment, { backgroundColor: colors.background }]}>
            {([
              ['stdio', 'stdio'],
              ['streamableHttp', 'HTTP'],
              ['sse', 'SSE'],
            ] as const).map(([transport, label]) => {
              const active = form.transport === transport;
              return (
                <Pressable
                  accessibilityLabel={`${t('settings.mcp.transport')} ${label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={transport}
                  onPress={() => update('transport', transport)}
                  style={[
                    styles.transportButton,
                    active && { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.transportText, { color: active ? colors.foreground : colors.muted }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <FieldLabel colors={colors} label={remote ? t('settings.mcp.serverUrl') : t('settings.mcp.command')}>
            <TextInput
              accessibilityLabel={remote ? t('settings.mcp.serverUrl') : t('settings.mcp.command')}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => update(remote ? 'url' : 'command', value)}
              placeholder={remote ? (form.transport === 'sse' ? 'https://example.com/sse' : 'https://example.com/mcp') : 'npx'}
              placeholderTextColor={colors.subtle}
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={remote ? form.url : form.command}
            />
          </FieldLabel>
          <Pressable
            accessibilityLabel={advancedOpen ? t('settings.mcp.hideAdvanced') : t('settings.mcp.advancedOptions')}
            accessibilityRole="button"
            accessibilityState={{ expanded: advancedOpen }}
            onPress={() => onAdvancedChange(!advancedOpen)}
            style={styles.advancedButton}
          >
            <ChevronDown color={colors.muted} size={15} style={{ transform: [{ rotate: advancedOpen ? '180deg' : '0deg' }] }} />
            <Text style={[styles.advancedText, { color: colors.muted }]}>{advancedOpen ? t('settings.mcp.hideAdvanced') : t('settings.mcp.advancedOptions')}</Text>
          </Pressable>
          {advancedOpen ? (
            <View style={styles.advancedFields}>
              <FieldLabel colors={colors} label={remote ? t('settings.mcp.headers') : t('settings.mcp.args')}>
                <TextInput
                  accessibilityLabel={remote ? t('settings.mcp.headers') : t('settings.mcp.args')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  onChangeText={(value) => update(remote ? 'headers' : 'args', value)}
                  placeholder={remote ? '{"Authorization":"Bearer ..."}' : '["-y", "docs-mcp"]'}
                  placeholderTextColor={colors.subtle}
                  style={[styles.jsonInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  textAlignVertical="top"
                  value={remote ? form.headers : form.args}
                />
              </FieldLabel>
              <FieldLabel colors={colors} label={t('settings.mcp.env')}>
                <TextInput
                  accessibilityLabel={t('settings.mcp.env')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  onChangeText={(value) => update('env', value)}
                  placeholder={'{"API_KEY":"..."}'}
                  placeholderTextColor={colors.subtle}
                  style={[styles.jsonInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  textAlignVertical="top"
                  value={form.env}
                />
              </FieldLabel>
              <FieldLabel colors={colors} label={t('settings.mcp.timeout')}>
                <TextInput
                  accessibilityLabel={t('settings.mcp.timeout')}
                  inputMode="numeric"
                  onChangeText={(value) => update('toolTimeout', value)}
                  placeholderTextColor={colors.subtle}
                  style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={form.toolTimeout}
                />
              </FieldLabel>
            </View>
          ) : null}
          <Pressable
            accessibilityLabel={t('settings.mcp.saveCustom')}
            accessibilityRole="button"
            accessibilityState={{ busy: customBusy, disabled: !canSave || actionsDisabled }}
            disabled={!canSave || actionsDisabled}
            onPress={onSave}
            style={[styles.primaryPanelButton, { backgroundColor: colors.foreground, opacity: canSave && !actionsDisabled ? 1 : 0.38 }]}
          >
            {customBusy ? <ActivityIndicator color={colors.background} size="small" /> : <Check color={colors.background} size={15} />}
            <Text style={[styles.primaryPanelButtonText, { color: colors.background }]}>{t('settings.mcp.saveCustom')}</Text>
          </Pressable>
        </View>
      ) : null}

      {mode === 'import' ? (
        <View style={[styles.customBody, { borderTopColor: colors.border }]}>
          <FieldLabel colors={colors} label={t('settings.mcp.configImport')}>
            <TextInput
              accessibilityLabel={t('settings.mcp.configImport')}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={onConfigImportChange}
              placeholder={'{"mcpServers":{"docs":{"command":"npx","args":["-y","docs-mcp"]}}}'}
              placeholderTextColor={colors.subtle}
              style={[styles.importInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              textAlignVertical="top"
              value={configImport}
            />
          </FieldLabel>
          <Pressable
            accessibilityLabel={t('settings.mcp.importConfig')}
            accessibilityRole="button"
            accessibilityState={{ busy: importBusy, disabled: !configImport.trim() || actionsDisabled }}
            disabled={!configImport.trim() || actionsDisabled}
            onPress={onImport}
            style={[
              styles.primaryPanelButton,
              { backgroundColor: colors.foreground, opacity: configImport.trim() && !actionsDisabled ? 1 : 0.38 },
            ]}
          >
            {importBusy ? <ActivityIndicator color={colors.background} size="small" /> : <Database color={colors.background} size={15} />}
            <Text style={[styles.primaryPanelButtonText, { color: colors.background }]}>{t('settings.mcp.importConfig')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function FieldLabel({
  children,
  colors,
  label,
}: {
  children: ReactNode;
  colors: Palette;
  label: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  customPanel: { marginTop: 16, marginBottom: 14, borderRadius: 16, overflow: 'hidden' },
  customHeader: { paddingHorizontal: 12, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  customIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  customHeaderCopy: { flex: 1, minWidth: 0 },
  customTitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  customSubtitle: { marginTop: 1, fontSize: 11.5, lineHeight: 16 },
  customModeRow: { padding: 12, flexDirection: 'row', gap: 8 },
  customModeButton: { flex: 1, height: 35, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  customModeText: { fontSize: 11.5, fontWeight: '700' },
  customBody: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12 },
  fieldGroup: { marginTop: 10, gap: 5 },
  fieldLabel: { fontSize: 11.5, fontWeight: '600' },
  fieldInput: { height: 43, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: 12, fontSize: 13 },
  transportSegment: { borderRadius: 11, padding: 3, flexDirection: 'row' },
  transportButton: { flex: 1, height: 33, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  transportText: { fontSize: 11.5, fontWeight: '700' },
  advancedButton: { alignSelf: 'flex-start', marginTop: 9, height: 32, flexDirection: 'row', alignItems: 'center', gap: 5 },
  advancedText: { fontSize: 11.5, fontWeight: '600' },
  advancedFields: { gap: 1 },
  jsonInput: { minHeight: 76, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 12, lineHeight: 17, fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' },
  importInput: { minHeight: 108, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 12, lineHeight: 17, fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' },
  primaryPanelButton: { marginTop: 12, minHeight: 40, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryPanelButtonText: { fontSize: 12.5, fontWeight: '700' },
});
