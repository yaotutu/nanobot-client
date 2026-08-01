import { Check, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { McpPresetInfo } from '@/types/api';
import type { Palette } from '@/ui/palette';

import type { McpAction } from './apps-utils';
import { ToolLogo, TypeBadge } from './AppsShared';

export function McpPresetRow({
  preset,
  colors,
  actionKey,
  setupOpen,
  values,
  onToggleSetup,
  onChangeValue,
  onAction,
  onToolsChange,
}: {
  preset: McpPresetInfo;
  colors: Palette;
  actionKey: string | null;
  setupOpen: boolean;
  values: Record<string, string>;
  onToggleSetup: () => void;
  onChangeValue: (field: string, value: string) => void;
  onAction: (action: McpAction, preset: McpPresetInfo, values?: Record<string, string>) => void;
  onToolsChange: (preset: McpPresetInfo, enabledTools: string[]) => void;
}) {
  const { t } = useTranslation();
  const [toolsOpen, setToolsOpen] = useState(false);
  const busy = Boolean(actionKey?.endsWith(`:mcp:${preset.name}`));
  const ready = preset.installed && preset.configured;
  const hasFields = preset.required_fields.length > 0;
  const toolNames = preset.tool_names ?? [];
  const enabledTools = preset.enabled_tools ?? ['*'];
  const allowAllTools = enabledTools.includes('*');
  const enabledSet = new Set(allowAllTools ? toolNames : enabledTools);
  const description = preset.description || preset.note || preset.connection_summary || preset.name;
  const requiredReady = preset.required_fields.every((field) => (
    !field.required || field.configured || Boolean(values[field.name]?.trim())
  ));
  const showMenu = () => {
    const actions = [
      { text: t('settings.actions.cancel'), style: 'cancel' },
      { text: t('settings.mcp.test'), onPress: () => onAction('test', preset) },
      ...(toolNames.length ? [{ text: t('settings.mcp.toolScope'), onPress: () => setToolsOpen((open) => !open) }] : []),
      { text: t('settings.mcp.remove'), style: 'destructive', onPress: () => onAction('remove', preset) },
    ] as Parameters<typeof Alert.alert>[2];
    Alert.alert(preset.display_name, preset.connection_summary || description, actions);
  };
  const setTools = (next: string[]) => onToolsChange(preset, next);
  const toggleTool = (toolName: string) => {
    const next = new Set(allowAllTools ? toolNames : enabledTools);
    if (next.has(toolName)) next.delete(toolName);
    else next.add(toolName);
    const nextValues = Array.from(next);
    setTools(nextValues.length === toolNames.length ? ['*'] : nextValues);
  };
  return (
    <View style={[styles.toolGroup, { borderBottomColor: colors.border }]}>
      <View style={styles.toolRowInner}>
        <ToolLogo
          brandColor={preset.brand_color}
          colors={colors}
          displayName={preset.display_name}
          logoUrl={preset.logo_url}
        />
        <View style={styles.toolCopy}>
          <View style={styles.toolTitleRow}>
            <Text numberOfLines={1} style={[styles.toolTitle, { color: colors.foreground }]}>{preset.display_name}</Text>
            <TypeBadge colors={colors} label={t('settings.apps.mcpLabel', { defaultValue: 'Integration' })} />
          </View>
          <Text numberOfLines={1} style={[styles.toolDescription, { color: colors.muted }]}>{description}</Text>
        </View>
        {busy ? <ActivityIndicator color={colors.muted} size="small" /> : ready ? (
          <View style={styles.rowActions}>
            <Pressable accessibilityLabel={t('settings.mcp.statusConfigured')} onPress={showMenu} style={[styles.actionButton, { backgroundColor: colors.card }]}>
              <Check color="#4F8A62" size={17} strokeWidth={2} />
            </Pressable>
            <Pressable accessibilityLabel={t('settings.mcp.remove')} onPress={() => onAction('remove', preset)} style={styles.actionButton}>
              <Trash2 color={colors.errorText} size={16} strokeWidth={1.8} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityLabel={preset.install_supported ? t('settings.mcp.configure') : t('settings.mcp.statusComingSoon')}
            disabled={!preset.install_supported}
            onPress={() => hasFields ? onToggleSetup() : onAction('enable', preset, values)}
            style={[styles.actionButton, { opacity: preset.install_supported ? 1 : 0.38 }]}
          >
            <Plus color={colors.muted} size={18} />
          </Pressable>
        )}
      </View>

      {setupOpen && preset.install_supported && hasFields ? (
        <View style={[styles.setupPanel, { backgroundColor: colors.card }]}>
          <View style={styles.setupHeader}>
            <View style={styles.setupCopy}>
              <Text style={[styles.setupTitle, { color: colors.foreground }]}>{t('settings.mcp.connectTitle', { name: preset.display_name })}</Text>
              <Text style={[styles.setupHint, { color: colors.muted }]}>{t('settings.mcp.connectHint')}</Text>
            </View>
            <Pressable accessibilityLabel={t('settings.actions.cancel')} hitSlop={8} onPress={onToggleSetup}>
              <X color={colors.muted} size={16} />
            </Pressable>
          </View>
          {preset.required_fields.map((field) => (
            <View key={field.name} style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                {field.label}{field.configured ? ` · ${t('settings.mcp.configured')}` : ''}
              </Text>
              <TextInput
                accessibilityLabel={`${preset.display_name} ${field.label}`}
                autoCapitalize="none"
                onChangeText={(value) => onChangeValue(field.name, value)}
                placeholder={field.configured ? t('settings.mcp.keepExisting') : field.placeholder || field.label}
                placeholderTextColor={colors.subtle}
                secureTextEntry={field.secret}
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={values[field.name] ?? ''}
              />
            </View>
          ))}
          <Pressable
            accessibilityLabel={t('settings.mcp.connectTitle', { name: preset.display_name })}
            disabled={!requiredReady || busy}
            onPress={() => onAction('enable', preset, values)}
            style={[styles.connectButton, { backgroundColor: colors.foreground, opacity: requiredReady ? 1 : 0.38 }]}
          >
            {busy ? <ActivityIndicator color={colors.background} size="small" /> : (
              <Text style={[styles.connectText, { color: colors.background }]}>{t('settings.mcp.setup')}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {toolsOpen && ready && toolNames.length ? (
        <View style={[styles.toolsPanel, { backgroundColor: colors.card }]}>
          <View style={styles.toolsHeader}>
            <View style={styles.toolsTitleRow}>
              <SlidersHorizontal color={colors.muted} size={15} strokeWidth={1.8} />
              <Text style={[styles.toolsTitle, { color: colors.muted }]}>{t('settings.mcp.toolScope')}</Text>
            </View>
            <View style={styles.toolScopeActions}>
              <Pressable
                accessibilityLabel={`${preset.display_name} · ${t('settings.mcp.allTools')}`}
                disabled={busy}
                onPress={() => setTools(['*'])}
                style={[
                  styles.toolScopeButton,
                  {
                    backgroundColor: allowAllTools ? colors.foreground : colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.toolScopeText, { color: allowAllTools ? colors.background : colors.muted }]}>{t('settings.mcp.allTools')}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`${preset.display_name} · ${t('settings.mcp.noTools')}`}
                disabled={busy}
                onPress={() => setTools([])}
                style={[
                  styles.toolScopeButton,
                  {
                    backgroundColor: !allowAllTools && enabledSet.size === 0 ? colors.foreground : colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[
                  styles.toolScopeText,
                  { color: !allowAllTools && enabledSet.size === 0 ? colors.background : colors.muted },
                ]}>{t('settings.mcp.noTools')}</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.toolChips}>
            {toolNames.map((toolName) => {
              const selected = enabledSet.has(toolName);
              return (
                <Pressable
                  accessibilityLabel={`${selected ? t('settings.values.disabled') : t('settings.values.enabled')} ${toolName}`}
                  disabled={busy}
                  key={toolName}
                  onPress={() => toggleTool(toolName)}
                  style={[
                    styles.toolChip,
                    {
                      backgroundColor: selected ? '#E9F1FF' : colors.background,
                      borderColor: selected ? '#AFC7EF' : colors.border,
                    },
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.toolChipText, { color: selected ? '#315F9C' : colors.muted }]}>{toolName}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toolGroup: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  toolRowInner: { minHeight: 64, paddingHorizontal: 3, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 11 },
  toolCopy: { flex: 1, minWidth: 0 },
  toolTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  toolTitle: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  toolDescription: { marginTop: 2, fontSize: 12.5, lineHeight: 18 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  actionButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  setupPanel: { marginHorizontal: 2, marginBottom: 9, borderRadius: 14, padding: 12 },
  setupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  setupCopy: { flex: 1 },
  setupTitle: { fontSize: 13, fontWeight: '700' },
  setupHint: { marginTop: 2, fontSize: 11.5, lineHeight: 17 },
  fieldGroup: { marginTop: 10, gap: 5 },
  fieldLabel: { fontSize: 11.5, fontWeight: '600' },
  fieldInput: { height: 43, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: 12, fontSize: 13 },
  connectButton: { marginTop: 12, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  connectText: { fontSize: 13, fontWeight: '700' },
  toolsPanel: { marginHorizontal: 2, marginBottom: 9, borderRadius: 14, padding: 12 },
  toolsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  toolsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolsTitle: { fontSize: 11.5, fontWeight: '700' },
  toolScopeActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolScopeButton: { minWidth: 48, height: 29, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  toolScopeText: { fontSize: 11, fontWeight: '700' },
  toolChips: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toolChip: { maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  toolChipText: { maxWidth: 220, fontSize: 10.5, fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' },
});
