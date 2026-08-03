import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  completeProviderOAuth,
  createProviderSettings,
  loginProviderOAuth,
  logoutProviderOAuth,
  updateProviderSettings,
} from '@/features/settings/api';
import type {
  ProviderOAuthAuthorizationRequired,
  ProviderSettingsInfo,
  ProviderSettingsUpdate,
  SettingsPayload,
} from '@/types/api/settings';

import type { CustomProviderDraft, ProviderForm } from '@/features/settings/model/models-utils';
import {
  CUSTOM_PROVIDER_KEY,
  emptyCustomProvider,
  isAuthorizationRequired,
  isOAuthPending,
  providerForm,
} from '@/features/settings/model/models-utils';

interface UseProviderActionsOptions {
  settings: SettingsPayload;
  onSettingsChange: (settings: SettingsPayload) => void;
}

export function useProviderActions({ settings, onSettingsChange }: UseProviderActionsOptions) {
  const { t } = useTranslation();
  const dirtyFormsRef = useRef(new Set<string>());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, ProviderForm>>(() => providerForms(settings));
  const [keyVisible, setKeyVisible] = useState<Record<string, boolean>>({});
  const [keyEditing, setKeyEditing] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomProviderDraft>(emptyCustomProvider);
  const [customKeyVisible, setCustomKeyVisible] = useState(false);
  const [oauthFlow, setOauthFlow] = useState<ProviderOAuthAuthorizationRequired | null>(null);
  const [oauthCode, setOauthCode] = useState('');
  const [oauthPending, setOauthPending] = useState(false);

  useEffect(() => {
    setForms((current) => Object.fromEntries(settings.providers.map((provider) => [
      provider.name,
      dirtyFormsRef.current.has(provider.name) && current[provider.name]
        ? current[provider.name]
        : providerForm(provider),
    ])));
    setExpanded((current) => current && settings.providers.some((provider) => provider.name === current) ? current : null);
  }, [settings]);

  const updateForm = (name: string, value: Partial<ProviderForm>) => {
    const provider = settings.providers.find((item) => item.name === name);
    if (!provider) return;
    dirtyFormsRef.current.add(name);
    setForms((current) => ({
      ...current,
      [name]: { ...(current[name] ?? providerForm(provider)), ...value },
    }));
  };

  const toggle = (provider: ProviderSettingsInfo) => {
    if (expanded === provider.name) {
      setExpanded(null);
    } else {
      dirtyFormsRef.current.delete(provider.name);
      setExpanded(provider.name);
      setForms((current) => ({ ...current, [provider.name]: providerForm(provider) }));
      setKeyEditing((current) => ({ ...current, [provider.name]: false }));
      setKeyVisible((current) => ({ ...current, [provider.name]: false }));
    }
    setCreatingCustom(false);
    setError(null);
  };

  const applySettings = (next: SettingsPayload, providerName?: string) => {
    if (providerName) {
      dirtyFormsRef.current.delete(providerName);
      const provider = next.providers.find((item) => item.name === providerName);
      if (provider) {
        setForms((current) => ({ ...current, [providerName]: providerForm(provider) }));
      }
    }
    onSettingsChange(next);
  };

  const saveProvider = async (provider: ProviderSettingsInfo) => {
    if (busy) return;
    const form = forms[provider.name] ?? providerForm(provider);
    const oauth = provider.auth_type === 'oauth';
    const apiKey = form.apiKey.trim();
    if (!oauth && !provider.configured && (provider.api_key_required ?? true) && !apiKey) {
      setError(t('settings.byok.apiKeyRequired'));
      return;
    }
    const hasOptionalValue = Boolean(apiKey || form.apiBase.trim() || form.proxy.trim() || form.extraHeaders.trim() || form.extraBody.trim() || form.extraQuery.trim() || form.thinkingStyle.trim() || form.region.trim() || form.profile.trim());
    if (!oauth && !provider.configured && provider.api_key_required === false && !hasOptionalValue) {
      setError(t('settings.providers.configurationRequired', { defaultValue: 'Enter at least one provider setting.' }));
      return;
    }
    if (provider.is_custom && !form.displayName.trim()) {
      setError(t('settings.providers.customProviderNameRequired', { defaultValue: 'Provider name is required.' }));
      return;
    }
    setBusy(provider.name);
    setError(null);
    try {
      const update: ProviderSettingsUpdate = { provider: provider.name };
      if (!oauth) {
        update.apiKey = apiKey || undefined;
        update.apiBase = form.apiBase.trim();
        if (provider.is_custom) update.displayName = form.displayName.trim();
      }
      for (const field of provider.advanced_fields ?? []) {
        if (field === 'api_type') update.apiType = form.apiType;
        if (field === 'proxy') update.proxy = form.proxy.trim();
        if (field === 'extra_headers') update.extraHeaders = form.extraHeaders.trim();
        if (field === 'extra_body') update.extraBody = form.extraBody.trim();
        if (field === 'extra_query') update.extraQuery = form.extraQuery.trim();
        if (field === 'thinking_style') update.thinkingStyle = form.thinkingStyle.trim();
        if (field === 'region') update.region = form.region.trim();
        if (field === 'profile') update.profile = form.profile.trim();
      }
      const next = await updateProviderSettings(update);
      applySettings(next, provider.name);
      setKeyVisible((current) => ({ ...current, [provider.name]: false }));
      setKeyEditing((current) => ({ ...current, [provider.name]: false }));
      if (!oauth) setExpanded(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.providers.saveFailed', { defaultValue: 'Could not save the provider.' }));
    } finally {
      setBusy(null);
    }
  };

  const runOAuth = async (provider: ProviderSettingsInfo, action: 'login' | 'logout') => {
    if (busy) return;
    setBusy(provider.name);
    setError(null);
    try {
      const payload = action === 'login'
        ? await loginProviderOAuth(provider.name)
        : await logoutProviderOAuth(provider.name);
      if (isAuthorizationRequired(payload)) {
        setOauthFlow(payload);
        setOauthCode('');
        setOauthPending(false);
        setExpanded(provider.name);
        await Linking.openURL(payload.authorization_url);
      } else {
        applySettings(payload, provider.name);
        setOauthFlow(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.oauth.actionFailed', { defaultValue: 'OAuth action failed.' }));
    } finally {
      setBusy(null);
    }
  };

  const completeOAuth = async () => {
    if (!oauthFlow || !oauthCode.trim() || busy) return;
    setBusy(oauthFlow.provider);
    setError(null);
    try {
      const payload = await completeProviderOAuth(oauthFlow.provider, oauthFlow.flow_id, oauthCode.trim());
      if (isOAuthPending(payload)) {
        setOauthPending(true);
      } else {
        applySettings(payload, oauthFlow.provider);
        closeOAuth();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.oauth.finishFailed', { defaultValue: 'Could not finish OAuth authorization.' }));
    } finally {
      setBusy(null);
    }
  };

  const createCustom = async () => {
    if (busy || !customDraft.name.trim() || !customDraft.apiBase.trim()) return;
    setBusy(CUSTOM_PROVIDER_KEY);
    setError(null);
    try {
      const next = await createProviderSettings({
        name: customDraft.name.trim(),
        apiKey: customDraft.apiKey.trim() || undefined,
        apiBase: customDraft.apiBase.trim(),
        proxy: customDraft.proxy.trim(),
        extraHeaders: customDraft.extraHeaders.trim(),
        extraBody: customDraft.extraBody.trim(),
        extraQuery: customDraft.extraQuery.trim(),
        thinkingStyle: customDraft.thinkingStyle.trim(),
      });
      onSettingsChange(next);
      setCustomDraft(emptyCustomProvider());
      setCustomKeyVisible(false);
      setCreatingCustom(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.providers.createFailed', { defaultValue: 'Could not create the custom provider.' }));
    } finally {
      setBusy(null);
    }
  };

  const beginCustom = () => {
    setExpanded(null);
    setCustomDraft(emptyCustomProvider());
    setCreatingCustom(true);
    setError(null);
  };

  const closeOAuth = () => {
    setOauthFlow(null);
    setOauthCode('');
    setOauthPending(false);
  };

  return {
    beginCustom,
    busy,
    closeOAuth,
    completeOAuth,
    createCustom,
    creatingCustom,
    customDraft,
    customKeyVisible,
    error,
    expanded,
    forms,
    keyEditing,
    keyVisible,
    oauthCode,
    oauthFlow,
    oauthPending,
    runOAuth,
    saveProvider,
    setCreatingCustom,
    setCustomDraft,
    setCustomKeyVisible,
    setKeyEditing,
    setKeyVisible,
    setOauthCode,
    toggle,
    updateForm,
  };
}

function providerForms(settings: SettingsPayload): Record<string, ProviderForm> {
  return Object.fromEntries(settings.providers.map((provider) => [provider.name, providerForm(provider)]));
}
