import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppsScreenController } from '@/features/capabilities/hooks/use-apps-screen-controller';
import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type { Palette } from '@/ui/palette';

import { CliAppRow } from './CliAppRow';
import { CliReadyPanel } from './CliReadyPanel';
import { CustomMcpPanel } from './CustomMcpPanel';
import { McpPresetRow } from './McpPresetRow';
interface AppsScreenProps {
  colors: Palette;
  onBackToChat: () => void;
  onRestart?: () => void;
  restartPolicy: RuntimeClientPolicy;
}

export function AppsScreen({
  colors,
  onBackToChat,
  onRestart,
  restartPolicy,
}: AppsScreenProps) {
  const { t } = useTranslation();
  const {
    actionKey,
    applyCliAction,
    catalogBusy,
    changeMcpValue,
    customMcpAdvanced,
    customMcpForm,
    customMcpMode,
    filter,
    focusedApp,
    handleImport,
    handleMcpAction,
    handleRestart,
    handleSaveCustomMcp,
    items,
    load,
    loading,
    mcpConfigImport,
    mcpValues,
    query,
    readyCount,
    refreshing,
    restartBusy,
    restartRequired,
    setCustomMcpAdvanced,
    setCustomMcpForm,
    setCustomMcpMode,
    setFilter,
    setMcpConfigImport,
    setQuery,
    setStatus,
    setupPreset,
    status,
    togglePresetSetup,
    updateMcpTools,
  } = useAppsScreenController({ onRestart, restartPolicy });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.introRow}>
        <Text style={[styles.description, { color: colors.muted }]}>{t('settings.apps.description', { defaultValue: 'Add tools to nanobot, then use them in chat with @.' })}</Text>
        <Text style={[styles.readyCount, { color: colors.muted }]}>{t('settings.apps.readyCount', { defaultValue: '{{count}} ready', count: readyCount })}</Text>
      </View>

      <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Search color={colors.subtle} size={17} strokeWidth={1.8} />
        <TextInput
          accessibilityLabel={t('settings.cliApps.searchPlaceholder')}
          onChangeText={setQuery}
          placeholder={t('settings.cliApps.searchPlaceholder')}
          placeholderTextColor={colors.subtle}
          style={[styles.searchInput, { color: colors.foreground }]}
          value={query}
        />
        {query ? (
          <Pressable accessibilityLabel={t('common.clearSearch')} accessibilityRole="button" hitSlop={8} onPress={() => setQuery('')}>
            <X color={colors.subtle} size={16} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.segment, { backgroundColor: colors.card }]}>
        {([
          ['ready', t('settings.apps.filterAll', { defaultValue: 'Ready' })],
          ['cli', t('settings.apps.filterCli', { defaultValue: 'Apps' })],
          ['mcp', t('settings.apps.filterMcp', { defaultValue: 'Integrations' })],
        ] as const).map(([value, label]) => {
          const active = filter === value;
          return (
            <Pressable
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={value}
              onPress={() => setFilter(value)}
              style={[
                styles.segmentButton,
                active && { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.segmentText, { color: active ? colors.foreground : colors.muted }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {status ? (
        <View accessibilityRole={status.error ? 'alert' : undefined} style={[
          styles.status,
          {
            backgroundColor: status.error ? colors.errorBackground : colors.card,
            borderColor: status.error ? colors.errorText : colors.border,
          },
        ]}>
          <Text style={[styles.statusText, { color: status.error ? colors.errorText : colors.foreground }]}>{status.message}</Text>
          <Pressable accessibilityLabel={t('common.dismiss')} accessibilityRole="button" hitSlop={8} onPress={() => setStatus(null)}>
            <X color={status.error ? colors.errorText : colors.muted} size={16} />
          </Pressable>
        </View>
      ) : null}

      {focusedApp ? (
        <CliReadyPanel
          app={focusedApp}
          colors={colors}
          onBackToChat={onBackToChat}
        />
      ) : null}

      {restartRequired ? (
        <View style={[styles.restartNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.restartCopy}>
            <Text style={[styles.restartTitle, { color: colors.foreground }]}>{t('settings.values.restartPending')}</Text>
            <Text style={[styles.restartHint, { color: colors.muted }]}>{restartPolicy.canRestart ? t('settings.mcp.restartRequired') : restartPolicy.restartUnavailableReason}</Text>
          </View>
          {onRestart ? (
            <Pressable
              accessibilityLabel={t('app.system.restart')}
              accessibilityRole="button"
              accessibilityState={{ busy: restartBusy, disabled: restartBusy || !restartPolicy.canRestart }}
              disabled={restartBusy || !restartPolicy.canRestart}
              onPress={handleRestart}
              style={[styles.restartButton, { backgroundColor: colors.foreground, opacity: restartPolicy.canRestart ? 1 : 0.42 }]}
            >
              {restartBusy ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={[styles.restartButtonText, { color: colors.background }]}>{restartPolicy.canRestart ? t('app.system.restart') : restartPolicy.restartLabel}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.catalogHeading}>
        <Text style={[styles.catalogTitle, { color: colors.foreground }]}>{t('settings.mcp.toolScope')}</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.card }]}>
          <Text style={[styles.countText, { color: colors.muted }]}>{items.length}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('common.refresh')}
          accessibilityRole="button"
          accessibilityState={{ busy: refreshing, disabled: catalogBusy }}
          disabled={catalogBusy}
          hitSlop={8}
          onPress={() => void load(true)}
          style={styles.refreshButton}
        >
          {refreshing
            ? <ActivityIndicator color={colors.muted} size="small" />
            : <RefreshCw color={colors.muted} size={16} strokeWidth={1.8} />}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>{t('settings.apps.loading', { defaultValue: 'Loading tools...' })}</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={items}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.muted }]}>{t('settings.apps.empty', { defaultValue: 'No tools match this filter.' })}</Text>}
          ListFooterComponent={(
            <View>
              {filter === 'mcp' ? (
                <CustomMcpPanel
                  actionKey={actionKey}
                  advancedOpen={customMcpAdvanced}
                  colors={colors}
                  configImport={mcpConfigImport}
                  form={customMcpForm}
                  mode={customMcpMode}
                  onAdvancedChange={setCustomMcpAdvanced}
                  onConfigImportChange={setMcpConfigImport}
                  onFormChange={setCustomMcpForm}
                  onImport={handleImport}
                  onModeChange={setCustomMcpMode}
                  onSave={handleSaveCustomMcp}
                />
              ) : null}
              <Text style={[styles.brandNotice, { color: colors.subtle }]}>{t('settings.legal.thirdPartyBrands')}</Text>
            </View>
          )}
          refreshControl={<RefreshControl enabled={!catalogBusy} refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.muted} />}
          renderItem={({ item }) => item.kind === 'cli' ? (
            <CliAppRow
              actionKey={actionKey}
              app={item.app}
              colors={colors}
              onAction={applyCliAction}
            />
          ) : (
            <McpPresetRow
              actionKey={actionKey}
              colors={colors}
              onAction={handleMcpAction}
              onChangeValue={(field, value) => changeMcpValue(item.preset.name, field, value)}
              onToolsChange={updateMcpTools}
              onToggleSetup={() => togglePresetSetup(item.preset.name)}
              preset={item.preset}
              setupOpen={setupPreset === item.preset.name}
              values={mcpValues[item.preset.name] ?? {}}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 14 },
  introRow: { paddingTop: 15, paddingHorizontal: 2, gap: 4 },
  description: { fontSize: 13, lineHeight: 19 },
  readyCount: { fontSize: 12, fontWeight: '600' },
  searchBox: { height: 48, marginTop: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, minWidth: 0, height: '100%', paddingVertical: 0, fontSize: 15 },
  segment: { marginTop: 10, borderRadius: 12, padding: 3, flexDirection: 'row' },
  segmentButton: { flex: 1, height: 35, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 12, fontWeight: '600' },
  status: { marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { flex: 1, fontSize: 12, lineHeight: 18 },
  restartNotice: { marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  restartCopy: { flex: 1 },
  restartTitle: { fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
  restartHint: { marginTop: 2, fontSize: 11.5, lineHeight: 17 },
  restartButton: { minWidth: 82, height: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  restartButtonText: { fontSize: 11.5, fontWeight: '700' },
  catalogHeading: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 8 },
  catalogTitle: { fontSize: 15, fontWeight: '700' },
  countBadge: { minWidth: 26, height: 23, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11, fontWeight: '600' },
  refreshButton: { marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  listContent: { paddingBottom: 24 },
  emptyText: { paddingVertical: 44, textAlign: 'center', fontSize: 13 },
  brandNotice: { paddingHorizontal: 4, paddingTop: 2, paddingBottom: 18, fontSize: 10.5, lineHeight: 17 },
});
