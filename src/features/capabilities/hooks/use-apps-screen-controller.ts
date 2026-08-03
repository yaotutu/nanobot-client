import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppsActions } from '@/features/capabilities/hooks/use-apps-actions';
import { useAppsCatalog } from '@/features/capabilities/hooks/use-apps-catalog';
import {
  DEFAULT_CUSTOM_MCP_FORM,
  itemReady,
  searchText,
  titleOf,
  type AppsFilter,
  type CatalogItem,
  type CustomMcpForm,
  type CustomMcpMode,
  type McpAction,
} from '@/features/capabilities/model';
import type { McpPresetInfo } from '@/types/api/capabilities';
import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';

interface UseAppsScreenControllerOptions {
  onRestart?: () => void;
  restartPolicy: RuntimeClientPolicy;
}

export function useAppsScreenController({
  onRestart,
  restartPolicy,
}: UseAppsScreenControllerOptions) {
  const {
    applyCliAppsPayload,
    applyMcpPresetsPayload,
    cliPayload,
    load,
    loading,
    mcpPayload,
    refreshing,
    setStatus,
    status,
  } = useAppsCatalog();
  const {
    actionKey,
    applyCliAction,
    applyMcpAction,
    cliFocusName,
    importMcp,
    restartRequired,
    saveCustomMcp,
    updateMcpTools,
  } = useAppsActions({
    applyCliAppsPayload,
    applyMcpPresetsPayload,
    setStatus,
  });

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AppsFilter>('ready');
  const mountedRef = useRef(true);
  const [setupPreset, setSetupPreset] = useState<string | null>(null);
  const [mcpValues, setMcpValues] = useState<Record<string, Record<string, string>>>({});
  const [customMcpMode, setCustomMcpMode] = useState<CustomMcpMode>(null);
  const [customMcpAdvanced, setCustomMcpAdvanced] = useState(false);
  const [customMcpForm, setCustomMcpForm] = useState<CustomMcpForm>(DEFAULT_CUSTOM_MCP_FORM);
  const [mcpConfigImport, setMcpConfigImport] = useState('');
  const [restartBusy, setRestartBusy] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const focusedApp = cliFocusName
    ? cliPayload.apps.find((app) => app.name === cliFocusName && app.installed) ?? null
    : null;

  const handleRestart = useCallback(() => {
    if (!onRestart || !restartPolicy.canRestart || restartBusy) return;
    setRestartBusy(true);
    onRestart();
    setTimeout(() => {
      if (mountedRef.current) setRestartBusy(false);
    }, 4_000);
  }, [onRestart, restartBusy, restartPolicy.canRestart]);

  const handleImport = useCallback(() => {
    void importMcp(mcpConfigImport).then((imported) => {
      if (imported && mountedRef.current) setMcpConfigImport('');
    });
  }, [importMcp, mcpConfigImport]);

  const handleSaveCustomMcp = useCallback(() => {
    void saveCustomMcp(customMcpForm).then((saved) => {
      if (!saved || !mountedRef.current) return;
      setCustomMcpForm((current) => ({
        ...DEFAULT_CUSTOM_MCP_FORM,
        transport: current.transport,
      }));
    });
  }, [customMcpForm, saveCustomMcp]);

  const handleMcpAction = useCallback((
    action: McpAction,
    preset: McpPresetInfo,
    values: Record<string, string> = {},
  ) => {
    void applyMcpAction(action, preset, values).then((succeeded) => {
      if (!succeeded || !mountedRef.current) return;
      setSetupPreset(null);
      if (action === 'enable') {
        setMcpValues((current) => ({ ...current, [preset.name]: {} }));
      }
    });
  }, [applyMcpAction]);

  const changeMcpValue = useCallback((presetName: string, field: string, value: string) => {
    setMcpValues((current) => ({
      ...current,
      [presetName]: {
        ...(current[presetName] ?? {}),
        [field]: value,
      },
    }));
  }, []);

  const togglePresetSetup = useCallback((presetName: string) => {
    setSetupPreset((current) => current === presetName ? null : presetName);
  }, []);

  return {
    actionKey,
    applyCliAction,
    catalogBusy: loading || refreshing,
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
    readyCount: cliPayload.installed_count + mcpPayload.installed_count,
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
  };
}
