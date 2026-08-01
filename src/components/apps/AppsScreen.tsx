import { RefreshCw, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import {
  fetchCliApps,
  fetchMcpPresets,
  importMcpConfig,
  runCliAppAction,
  runMcpPresetAction,
  saveCustomMcpServer,
  updateMcpServerTools,
} from '@/features/capabilities/api';
import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type {
  CliAppInfo,
  CliAppsPayload,
  McpPresetInfo,
  McpPresetsPayload,
} from '@/types/api';
import type { Palette } from '@/ui/palette';

import { CliAppRow } from './CliAppRow';
import { CliReadyPanel } from './CliReadyPanel';
import { CustomMcpPanel } from './CustomMcpPanel';
import { McpPresetRow } from './McpPresetRow';
import {
  CLI_APPS_REFRESH_MAX_RETRIES,
  CLI_APPS_REFRESH_RETRY_MS,
  DEFAULT_CUSTOM_MCP_FORM,
  itemReady,
  searchText,
  titleOf,
} from './apps-utils';
import type {
  AppAction,
  AppsFilter,
  CatalogItem,
  CustomMcpForm,
  CustomMcpMode,
  McpAction,
} from './apps-utils';

interface AppsScreenProps {
  colors: Palette;
  initialCliApps: CliAppInfo[];
  initialMcpPresets: McpPresetInfo[];
  onCliAppsChanged: (payload: CliAppsPayload) => void;
  onMcpPresetsChanged: (payload: McpPresetsPayload) => void;
  onBackToChat: () => void;
  onRestart?: () => void;
  restartPolicy: RuntimeClientPolicy;
}

export function AppsScreen({
  colors,
  initialCliApps,
  initialMcpPresets,
  onCliAppsChanged,
  onMcpPresetsChanged,
  onBackToChat,
  onRestart,
  restartPolicy,
}: AppsScreenProps) {
  const { t } = useTranslation();
  const [cliPayload, setCliPayload] = useState<CliAppsPayload>({
    apps: initialCliApps,
    installed_count: initialCliApps.filter((app) => app.installed).length,
  });
  const [mcpPayload, setMcpPayload] = useState<McpPresetsPayload>({
    presets: initialMcpPresets,
    installed_count: initialMcpPresets.filter((preset) => preset.installed && preset.configured).length,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AppsFilter>('ready');
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [status, setStatus] = useState<{ message: string; error: boolean } | null>(null);
  const [setupPreset, setSetupPreset] = useState<string | null>(null);
  const [mcpValues, setMcpValues] = useState<Record<string, Record<string, string>>>({});
  const [cliFocusName, setCliFocusName] = useState<string | null>(null);
  const [customMcpMode, setCustomMcpMode] = useState<CustomMcpMode>(null);
  const [customMcpAdvanced, setCustomMcpAdvanced] = useState(false);
  const [customMcpForm, setCustomMcpForm] = useState<CustomMcpForm>(DEFAULT_CUSTOM_MCP_FORM);
  const [mcpConfigImport, setMcpConfigImport] = useState('');
  const [restartRequired, setRestartRequired] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const mountedRef = useRef(true);
  const cliRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (cliRetryTimerRef.current) clearTimeout(cliRetryTimerRef.current);
    };
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (!mountedRef.current) return;
    if (cliRetryTimerRef.current) {
      clearTimeout(cliRetryTimerRef.current);
      cliRetryTimerRef.current = null;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    const [cliResult, mcpResult] = await Promise.allSettled([
      fetchCliApps(),
      fetchMcpPresets(),
    ]);
    if (!mountedRef.current) return;
    if (cliResult.status === 'fulfilled') {
      setCliPayload(cliResult.value);
      onCliAppsChanged(cliResult.value);
      if (cliResult.value.catalog_refresh_pending) {
        const pollCliCatalog = (retryCount: number) => {
          if (!mountedRef.current || retryCount >= CLI_APPS_REFRESH_MAX_RETRIES) return;
          cliRetryTimerRef.current = setTimeout(() => {
            cliRetryTimerRef.current = null;
            void fetchCliApps()
              .then((payload) => {
                if (!mountedRef.current) return;
                setCliPayload(payload);
                onCliAppsChanged(payload);
                if (payload.catalog_refresh_pending) pollCliCatalog(retryCount + 1);
              })
              .catch((caught) => {
                if (!mountedRef.current) return;
                setStatus({
                  message: caught instanceof Error ? caught.message : t('settings.cliApps.refreshFailed', { defaultValue: 'Could not refresh the app catalog.' }),
                  error: true,
                });
              });
          }, CLI_APPS_REFRESH_RETRY_MS);
        };
        pollCliCatalog(0);
      }
    }
    if (mcpResult.status === 'fulfilled') {
      setMcpPayload(mcpResult.value);
      onMcpPresetsChanged(mcpResult.value);
    }
    const errors = [cliResult, mcpResult]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason instanceof Error ? result.reason.message : t('settings.cliApps.loadFailed', { defaultValue: 'Could not load the tools catalog.' }));
    setStatus(errors.length ? { message: errors.join('\n'), error: true } : null);
    setLoading(false);
    setRefreshing(false);
  }, [onCliAppsChanged, onMcpPresetsChanged, t]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const items = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [
      ...cliPayload.apps.map((app): CatalogItem => ({ id: `cli:${app.name}`, kind: 'cli', app })),
      ...mcpPayload.presets.map((preset): CatalogItem => ({ id: `mcp:${preset.name}`, kind: 'mcp', preset })),
    ]
      .filter((item) => {
        if (needle) return searchText(item).includes(needle);
        return filter === 'ready' ? itemReady(item) : item.kind === filter;
      })
      .sort((left, right) => {
        const readyRank = Number(!itemReady(left)) - Number(!itemReady(right));
        return readyRank || titleOf(left).localeCompare(titleOf(right));
      });
  }, [cliPayload.apps, filter, mcpPayload.presets, query]);

  const applyCliAction = async (action: AppAction, app: CliAppInfo) => {
    const key = `${action}:cli:${app.name}`;
    if (actionKey) return;
    setActionKey(key);
    setStatus(null);
    try {
      const payload = await runCliAppAction(action, app.name);
      setCliPayload(payload);
      if (action !== 'test') onCliAppsChanged(payload);
      setCliFocusName(action === 'uninstall' ? null : app.name);
      setStatus({
        message: payload.last_action?.message || t('settings.cliApps.actionCompleted', { defaultValue: '{{name}} action completed.', name: app.display_name }),
        error: payload.last_action?.ok === false,
      });
    } catch (caught) {
      setStatus({
        message: caught instanceof Error ? caught.message : t('settings.cliApps.actionFailed', { defaultValue: '{{name}} action failed.', name: app.display_name }),
        error: true,
      });
    } finally {
      setActionKey(null);
    }
  };

  const applyMcpAction = async (
    action: McpAction,
    preset: McpPresetInfo,
    values: Record<string, string> = {},
  ) => {
    const key = `${action}:mcp:${preset.name}`;
    if (actionKey) return;
    setActionKey(key);
    setStatus(null);
    try {
      const payload = await runMcpPresetAction(action,
        preset.name,
        values,
      );
      setMcpPayload(payload);
      if (action !== 'test') onMcpPresetsChanged(payload);
      if (payload.requires_restart) setRestartRequired(true);
      setSetupPreset(null);
      if (action === 'enable') {
        setMcpValues((current) => ({ ...current, [preset.name]: {} }));
      }
      setStatus({
        message: payload.last_action?.message || t('settings.mcp.actionCompleted', { defaultValue: '{{name}} action completed.', name: preset.display_name }),
        error: payload.last_action?.ok === false,
      });
    } catch (caught) {
      setStatus({
        message: caught instanceof Error ? caught.message : t('settings.mcp.actionFailed', { defaultValue: '{{name}} action failed.', name: preset.display_name }),
        error: true,
      });
    } finally {
      setActionKey(null);
    }
  };

  const applyMcpMutation = (
    payload: McpPresetsPayload,
    fallbackMessage: string,
  ) => {
    setMcpPayload(payload);
    onMcpPresetsChanged(payload);
    if (payload.requires_restart) setRestartRequired(true);
    setStatus({
      message: payload.last_action?.message || fallbackMessage,
      error: payload.last_action?.ok === false,
    });
  };

  const saveCustomMcp = async () => {
    const name = customMcpForm.name.trim();
    const remote = customMcpForm.transport !== 'stdio';
    if (!name || (remote ? !customMcpForm.url.trim() : !customMcpForm.command.trim()) || actionKey) return;
    setActionKey(`custom:${name}`);
    setStatus(null);
    try {
      const payload = await saveCustomMcpServer({
        name,
        transport: customMcpForm.transport,
        command: customMcpForm.command,
        args: customMcpForm.args,
        url: customMcpForm.url,
        env: customMcpForm.env,
        headers: customMcpForm.headers,
        tool_timeout: customMcpForm.toolTimeout,
      });
      applyMcpMutation(payload, t('settings.mcp.saved', { defaultValue: '{{name}} MCP saved.', name }));
      setCustomMcpForm((current) => ({
        ...DEFAULT_CUSTOM_MCP_FORM,
        transport: current.transport,
      }));
    } catch (caught) {
      setStatus({
        message: caught instanceof Error ? caught.message : t('settings.mcp.saveFailed', { defaultValue: 'Could not save the custom MCP server.' }),
        error: true,
      });
    } finally {
      setActionKey(null);
    }
  };

  const importMcp = async () => {
    if (!mcpConfigImport.trim() || actionKey) return;
    setActionKey('import');
    setStatus(null);
    try {
      const payload = await importMcpConfig(mcpConfigImport);
      applyMcpMutation(payload, t('settings.mcp.imported', { defaultValue: 'MCP configuration imported.' }));
      setMcpConfigImport('');
    } catch (caught) {
      setStatus({
        message: caught instanceof Error ? caught.message : t('settings.mcp.importFailed', { defaultValue: 'Could not import the MCP configuration.' }),
        error: true,
      });
    } finally {
      setActionKey(null);
    }
  };

  const updateMcpTools = async (preset: McpPresetInfo, enabledTools: string[]) => {
    if (actionKey) return;
    setActionKey(`tools:mcp:${preset.name}`);
    setStatus(null);
    try {
      const payload = await updateMcpServerTools(preset.name,
        enabledTools,
      );
      applyMcpMutation(payload, t('settings.mcp.toolScopeUpdated', { defaultValue: '{{name}} tool scope updated.', name: preset.display_name }));
    } catch (caught) {
      setStatus({
        message: caught instanceof Error ? caught.message : t('settings.mcp.toolScopeUpdateFailed', { defaultValue: 'Could not update MCP tool scope.' }),
        error: true,
      });
    } finally {
      setActionKey(null);
    }
  };

  const focusedApp = cliFocusName
    ? cliPayload.apps.find((app) => app.name === cliFocusName && app.installed) ?? null
    : null;

  const readyCount = cliPayload.installed_count + mcpPayload.installed_count;

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
          <Pressable accessibilityLabel={t('settings.apps.clearSearch', { defaultValue: 'Clear search' })} hitSlop={8} onPress={() => setQuery('')}>
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
              accessibilityLabel={t('settings.apps.filterLabel', { defaultValue: 'Filter: {{label}}', label })}
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
        <View style={[
          styles.status,
          {
            backgroundColor: status.error ? colors.errorBackground : colors.card,
            borderColor: status.error ? colors.errorText : colors.border,
          },
        ]}>
          <Text style={[styles.statusText, { color: status.error ? colors.errorText : colors.foreground }]}>{status.message}</Text>
          <Pressable accessibilityLabel={t('settings.apps.dismissStatus', { defaultValue: 'Dismiss status' })} hitSlop={8} onPress={() => setStatus(null)}>
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
              disabled={restartBusy || !restartPolicy.canRestart}
              onPress={() => {
                if (!restartPolicy.canRestart) return;
                setRestartBusy(true);
                onRestart();
                setTimeout(() => {
                  if (mountedRef.current) setRestartBusy(false);
                }, 4_000);
              }}
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
        <Pressable accessibilityLabel={t('settings.apps.refreshCatalog', { defaultValue: 'Refresh app catalog' })} hitSlop={8} onPress={() => void load(true)} style={styles.refreshButton}>
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
                  onImport={() => void importMcp()}
                  onModeChange={setCustomMcpMode}
                  onSave={() => void saveCustomMcp()}
                />
              ) : null}
              <Text style={[styles.brandNotice, { color: colors.subtle }]}>{t('settings.legal.thirdPartyBrands')}</Text>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.muted} />}
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
              onAction={applyMcpAction}
              onChangeValue={(field, value) => {
                setMcpValues((current) => ({
                  ...current,
                  [item.preset.name]: {
                    ...(current[item.preset.name] ?? {}),
                    [field]: value,
                  },
                }));
              }}
              onToolsChange={updateMcpTools}
              onToggleSetup={() => setSetupPreset((current) => current === item.preset.name ? null : item.preset.name)}
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
