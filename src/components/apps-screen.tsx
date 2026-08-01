import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import {
  Check,
  ChevronDown,
  Copy,
  Database,
  Plus,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useLogoFallback } from '@/hooks/use-logo-fallback';
import {
  fetchCliApps,
  fetchMcpPresets,
  importMcpConfig,
  runCliAppAction,
  runMcpPresetAction,
  saveCustomMcpServer,
  updateMcpServerTools,
} from '@/features/capabilities/api';
import { isGenericRepositoryLogoUrl, logoFallbackUrls } from '@/services/provider-brand';
import type { RuntimeClientPolicy } from '@/services/runtime-capabilities';
import type {
  CliAppInfo,
  CliAppsPayload,
  McpPresetInfo,
  McpPresetsPayload,
} from '@/types/api';
import type { Palette } from '@/ui/palette';


type AppsFilter = 'ready' | 'cli' | 'mcp';
type AppAction = 'install' | 'update' | 'uninstall' | 'test';
type McpAction = 'enable' | 'remove' | 'test';
type CustomMcpTransport = 'stdio' | 'streamableHttp' | 'sse';
type CustomMcpMode = 'custom' | 'import' | null;
type CatalogItem =
  | { id: string; kind: 'cli'; app: CliAppInfo }
  | { id: string; kind: 'mcp'; preset: McpPresetInfo };

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

interface CustomMcpForm {
  name: string;
  transport: CustomMcpTransport;
  command: string;
  args: string;
  url: string;
  env: string;
  headers: string;
  toolTimeout: string;
}

const CLI_APPS_REFRESH_RETRY_MS = 2_000;
const CLI_APPS_REFRESH_MAX_RETRIES = 30;
const DEFAULT_CUSTOM_MCP_FORM: CustomMcpForm = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  env: '',
  headers: '',
  toolTimeout: '30',
};

function titleOf(item: CatalogItem): string {
  return item.kind === 'cli' ? item.app.display_name : item.preset.display_name;
}

function itemReady(item: CatalogItem): boolean {
  return item.kind === 'cli'
    ? item.app.installed
    : item.preset.installed && item.preset.configured;
}

function searchText(item: CatalogItem): string {
  if (item.kind === 'cli') {
    const { app } = item;
    return [
      app.display_name,
      app.name,
      app.category,
      app.description,
      app.requires,
      app.entry_point,
      app.source,
    ].join(' ').toLocaleLowerCase();
  }
  const { preset } = item;
  return [
    preset.display_name,
    preset.name,
    preset.category,
    preset.description,
    preset.transport,
    preset.requires,
    preset.note,
    preset.connection_summary,
    ...(preset.tool_names ?? []),
  ].join(' ').toLocaleLowerCase();
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

function CliAppRow({
  app,
  colors,
  actionKey,
  onAction,
}: {
  app: CliAppInfo;
  colors: Palette;
  actionKey: string | null;
  onAction: (action: AppAction, app: CliAppInfo) => void;
}) {
  const { t } = useTranslation();
  const busy = Boolean(actionKey?.endsWith(`:cli:${app.name}`));
  const description = app.description || app.requires || app.entry_point || app.name;
  const showMenu = () => {
    Alert.alert(app.display_name, description, [
      { text: t('settings.actions.cancel'), style: 'cancel' },
      { text: t('settings.mcp.test'), onPress: () => onAction('test', app) },
      { text: t('settings.cliApps.update'), onPress: () => onAction('update', app) },
      { text: t('settings.cliApps.uninstall'), style: 'destructive', onPress: () => onAction('uninstall', app) },
    ]);
  };
  return (
    <View style={[styles.toolRow, { borderBottomColor: colors.border }]}>
      <ToolLogo
        brandColor={app.brand_color}
        colors={colors}
        displayName={app.display_name}
        hideGenericRepositoryLogo
        logoUrl={app.logo_url}
      />
      <View style={styles.toolCopy}>
        <View style={styles.toolTitleRow}>
          <Text numberOfLines={1} style={[styles.toolTitle, { color: colors.foreground }]}>{app.display_name}</Text>
          <TypeBadge colors={colors} label={t('settings.apps.cliLabel', { defaultValue: 'App' })} />
        </View>
        <Text numberOfLines={1} style={[styles.toolDescription, { color: colors.muted }]}>{description}</Text>
      </View>
      {busy ? <ActivityIndicator color={colors.muted} size="small" /> : app.installed ? (
        <View style={styles.rowActions}>
          <Pressable accessibilityLabel={t('settings.cliApps.statusInstalled')} onPress={showMenu} style={[styles.actionButton, { backgroundColor: colors.card }]}>
            <Check color="#4F8A62" size={17} strokeWidth={2} />
          </Pressable>
          <Pressable accessibilityLabel={t('settings.cliApps.uninstall')} onPress={() => onAction('uninstall', app)} style={styles.actionButton}>
            <Trash2 color={colors.errorText} size={16} strokeWidth={1.8} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityLabel={app.install_supported ? t('settings.cliApps.install') : t('settings.cliApps.unavailable')}
          disabled={!app.install_supported}
          onPress={() => onAction('install', app)}
          style={[styles.actionButton, { opacity: app.install_supported ? 1 : 0.38 }]}
        >
          <Plus color={colors.muted} size={18} />
        </Pressable>
      )}
    </View>
  );
}

function McpPresetRow({
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

function CliReadyPanel({
  app,
  colors,
  onBackToChat,
}: {
  app: CliAppInfo;
  colors: Palette;
  onBackToChat: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const prompt = t('settings.cliApps.readyPrompt', { name: app.name });
  const copyPrompt = async () => {
    await Clipboard.setStringAsync(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_400);
  };
  return (
    <View style={[styles.readyPanel, { backgroundColor: colors.card }]}>
      <ToolLogo
        brandColor={app.brand_color}
        colors={colors}
        displayName={app.display_name}
        hideGenericRepositoryLogo
        logoUrl={app.logo_url}
      />
      <View style={styles.readyPanelCopy}>
        <View style={styles.readyPanelTitleRow}>
          <Text numberOfLines={1} style={[styles.readyPanelTitle, { color: colors.foreground }]}>{app.display_name}</Text>
          <View style={[styles.readyBadge, { backgroundColor: colors.background }]}>
            <Check color="#4F8A62" size={12} strokeWidth={2} />
            <Text style={[styles.readyBadgeText, { color: colors.muted }]}>{t('settings.cliApps.readyStatus')}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={[styles.readyPanelMeta, { color: colors.muted }]}>@{app.name} · {app.entry_point || app.name} · {app.category}</Text>
      </View>
      <View style={styles.readyPanelActions}>
        <Pressable
          accessibilityLabel={t('settings.cliApps.readyTry', { name: app.name })}
          onPress={() => void copyPrompt()}
          style={[styles.readyAction, { borderColor: colors.border }]}
        >
          {copied ? <Check color={colors.muted} size={13} /> : <Copy color={colors.muted} size={13} />}
          <Text style={[styles.readyActionText, { color: colors.muted }]}>{copied ? t('settings.cliApps.readyCopied') : t('settings.cliApps.readyTry', { name: app.name })}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={t('settings.cliApps.openChat')}
          onPress={onBackToChat}
          style={[styles.readyAction, { backgroundColor: colors.foreground, borderColor: colors.foreground }]}
        >
          <Text style={[styles.readyActionText, { color: colors.background }]}>{t('settings.cliApps.openChat')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CustomMcpPanel({
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
            disabled={!canSave || customBusy}
            onPress={onSave}
            style={[styles.primaryPanelButton, { backgroundColor: colors.foreground, opacity: canSave ? 1 : 0.38 }]}
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
            disabled={!configImport.trim() || importBusy}
            onPress={onImport}
            style={[
              styles.primaryPanelButton,
              { backgroundColor: colors.foreground, opacity: configImport.trim() ? 1 : 0.38 },
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

function FieldLabel({
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

function ToolLogo({
  logoUrl: rawLogoUrl,
  displayName,
  brandColor,
  colors,
  hideGenericRepositoryLogo = false,
}: {
  logoUrl?: string | null;
  displayName: string;
  brandColor?: string | null;
  colors: Palette;
  hideGenericRepositoryLogo?: boolean;
}) {
  const logoUrls = useMemo(
    () => hideGenericRepositoryLogo && isGenericRepositoryLogoUrl(rawLogoUrl)
      ? []
      : logoFallbackUrls(rawLogoUrl),
    [hideGenericRepositoryLogo, rawLogoUrl],
  );
  const { logoUrl, logoLoaded, onLogoError, onLogoLoad } = useLogoFallback(logoUrls);
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('') || displayName.slice(0, 2).toLocaleUpperCase() || 'AI';
  return (
    <View
      style={[
        styles.logo,
        {
          backgroundColor: logoUrl ? colors.background : brandColor || colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.logoFallback,
          { color: logoUrl ? colors.foreground : brandColor ? '#FFFFFF' : colors.foreground },
        ]}
      >
        {initials}
      </Text>
      {logoUrl ? (
        <Image
          accessibilityLabel={`${displayName} icon`}
          contentFit="contain"
          onError={onLogoError}
          onLoad={onLogoLoad}
          source={{ uri: logoUrl }}
          style={[styles.logoImage, styles.logoImageOverlay, !logoLoaded && styles.logoImageLoading]}
          transition={0}
        />
      ) : null}
    </View>
  );
}

function TypeBadge({ label, colors }: { label: string; colors: Palette }) {
  return (
    <View style={[styles.typeBadge, { backgroundColor: colors.card }]}>
      <Text style={[styles.typeText, { color: colors.muted }]}>{label}</Text>
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
  readyPanel: { marginTop: 10, borderRadius: 14, padding: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  readyPanelCopy: { flex: 1, minWidth: 170 },
  readyPanelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  readyPanelTitle: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  readyBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  readyBadgeText: { fontSize: 10, fontWeight: '600' },
  readyPanelMeta: { marginTop: 3, fontSize: 11.5, lineHeight: 17 },
  readyPanelActions: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', gap: 7 },
  readyAction: { minHeight: 34, borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  readyActionText: { fontSize: 11.5, fontWeight: '700' },
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
  toolRow: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 3, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  toolGroup: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  toolRowInner: { minHeight: 64, paddingHorizontal: 3, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 42, height: 42, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: 28, height: 28 },
  logoImageOverlay: { position: 'absolute' },
  logoImageLoading: { opacity: 0 },
  logoFallback: { fontSize: 12, fontWeight: '800' },
  toolCopy: { flex: 1, minWidth: 0 },
  toolTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  toolTitle: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  toolDescription: { marginTop: 2, fontSize: 12.5, lineHeight: 18 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  typeText: { fontSize: 9.5, fontWeight: '700' },
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
  brandNotice: { paddingHorizontal: 4, paddingTop: 2, paddingBottom: 18, fontSize: 10.5, lineHeight: 17 },
});
