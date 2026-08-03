import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  importMcpConfig,
  runCliAppAction,
  runMcpPresetAction,
  saveCustomMcpServer,
  updateMcpServerTools,
} from '@/features/capabilities/api';
import type { AppsCatalogStatus } from '@/features/capabilities/hooks/use-apps-catalog';
import type {
  CliAppInfo,
  CliAppsPayload,
  McpPresetInfo,
  McpPresetsPayload,
} from '@/types/api/capabilities';

import type {
  AppAction,
  CustomMcpForm,
  McpAction,
} from '@/features/capabilities/model';

interface UseAppsActionsOptions {
  applyCliAppsPayload: (payload: CliAppsPayload) => void;
  applyMcpPresetsPayload: (payload: McpPresetsPayload) => void;
  setStatus: (status: AppsCatalogStatus | null) => void;
}

export function useAppsActions({
  applyCliAppsPayload,
  applyMcpPresetsPayload,
  setStatus,
}: UseAppsActionsOptions) {
  const { t } = useTranslation();
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [cliFocusName, setCliFocusName] = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const actionKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const beginAction = useCallback((key: string): boolean => {
    if (!mountedRef.current || actionKeyRef.current) return false;
    actionKeyRef.current = key;
    setActionKey(key);
    return true;
  }, []);

  const endAction = useCallback((key: string) => {
    if (actionKeyRef.current !== key) return;
    actionKeyRef.current = null;
    if (mountedRef.current) setActionKey(null);
  }, []);

  const applyMcpMutation = useCallback((
    payload: McpPresetsPayload,
    fallbackMessage: string,
  ): boolean => {
    if (!mountedRef.current) return false;
    applyMcpPresetsPayload(payload);
    if (payload.requires_restart) setRestartRequired(true);
    setStatus({
      message: payload.last_action?.message || fallbackMessage,
      error: payload.last_action?.ok === false,
    });
    return payload.last_action?.ok !== false;
  }, [applyMcpPresetsPayload, setStatus]);

  const applyCliAction = useCallback(async (action: AppAction, app: CliAppInfo) => {
    const key = `${action}:cli:${app.name}`;
    if (!beginAction(key)) return;
    setStatus(null);
    try {
      const payload = await runCliAppAction(action, app.name);
      if (!mountedRef.current) return;
      applyCliAppsPayload(payload);
      setCliFocusName(action === 'uninstall' ? null : app.name);
      setStatus({
        message: payload.last_action?.message || t('settings.cliApps.actionCompleted', { defaultValue: '{{name}} action completed.', name: app.display_name }),
        error: payload.last_action?.ok === false,
      });
    } catch (caught) {
      if (!mountedRef.current) return;
      setStatus({
        message: caught instanceof Error ? caught.message : t('settings.cliApps.actionFailed', { defaultValue: '{{name}} action failed.', name: app.display_name }),
        error: true,
      });
    } finally {
      endAction(key);
    }
  }, [applyCliAppsPayload, beginAction, endAction, setStatus, t]);

  const applyMcpAction = useCallback(async (
    action: McpAction,
    preset: McpPresetInfo,
    values: Record<string, string> = {},
  ): Promise<boolean> => {
    const key = `${action}:mcp:${preset.name}`;
    if (!beginAction(key)) return false;
    setStatus(null);
    try {
      const payload = await runMcpPresetAction(action, preset.name, values);
      if (!mountedRef.current) return false;
      applyMcpPresetsPayload(payload);
      if (payload.requires_restart) setRestartRequired(true);
      setStatus({
        message: payload.last_action?.message || t('settings.mcp.actionCompleted', { defaultValue: '{{name}} action completed.', name: preset.display_name }),
        error: payload.last_action?.ok === false,
      });
      return payload.last_action?.ok !== false;
    } catch (caught) {
      if (!mountedRef.current) return false;
      setStatus({
        message: caught instanceof Error ? caught.message : t('settings.mcp.actionFailed', { defaultValue: '{{name}} action failed.', name: preset.display_name }),
        error: true,
      });
      return false;
    } finally {
      endAction(key);
    }
  }, [applyMcpPresetsPayload, beginAction, endAction, setStatus, t]);

  const saveCustomMcp = useCallback(async (form: CustomMcpForm): Promise<boolean> => {
    const name = form.name.trim();
    const remote = form.transport !== 'stdio';
    const key = `custom:${name}`;
    if (!name || (remote ? !form.url.trim() : !form.command.trim()) || !beginAction(key)) {
      return false;
    }
    setStatus(null);
    try {
      const payload = await saveCustomMcpServer({
        name,
        transport: form.transport,
        command: form.command,
        args: form.args,
        url: form.url,
        env: form.env,
        headers: form.headers,
        tool_timeout: form.toolTimeout,
      });
      return applyMcpMutation(
        payload,
        t('settings.mcp.saved', { defaultValue: '{{name}} MCP saved.', name }),
      );
    } catch (caught) {
      if (mountedRef.current) {
        setStatus({
          message: caught instanceof Error ? caught.message : t('settings.mcp.saveFailed', { defaultValue: 'Could not save the custom MCP server.' }),
          error: true,
        });
      }
      return false;
    } finally {
      endAction(key);
    }
  }, [applyMcpMutation, beginAction, endAction, setStatus, t]);

  const importMcp = useCallback(async (config: string): Promise<boolean> => {
    const key = 'import';
    if (!config.trim() || !beginAction(key)) return false;
    setStatus(null);
    try {
      const payload = await importMcpConfig(config);
      return applyMcpMutation(
        payload,
        t('settings.mcp.imported', { defaultValue: 'MCP configuration imported.' }),
      );
    } catch (caught) {
      if (mountedRef.current) {
        setStatus({
          message: caught instanceof Error ? caught.message : t('settings.mcp.importFailed', { defaultValue: 'Could not import the MCP configuration.' }),
          error: true,
        });
      }
      return false;
    } finally {
      endAction(key);
    }
  }, [applyMcpMutation, beginAction, endAction, setStatus, t]);

  const updateMcpTools = useCallback(async (
    preset: McpPresetInfo,
    enabledTools: string[],
  ) => {
    const key = `tools:mcp:${preset.name}`;
    if (!beginAction(key)) return;
    setStatus(null);
    try {
      const payload = await updateMcpServerTools(preset.name, enabledTools);
      applyMcpMutation(payload, t('settings.mcp.toolScopeUpdated', { defaultValue: '{{name}} tool scope updated.', name: preset.display_name }));
    } catch (caught) {
      if (!mountedRef.current) return;
      setStatus({
        message: caught instanceof Error ? caught.message : t('settings.mcp.toolScopeUpdateFailed', { defaultValue: 'Could not update MCP tool scope.' }),
        error: true,
      });
    } finally {
      endAction(key);
    }
  }, [applyMcpMutation, beginAction, endAction, setStatus, t]);

  return {
    actionKey,
    applyCliAction,
    applyMcpAction,
    cliFocusName,
    importMcp,
    restartRequired,
    saveCustomMcp,
    updateMcpTools,
  };
}
