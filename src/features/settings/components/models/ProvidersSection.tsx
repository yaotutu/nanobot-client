import * as Linking from 'expo-linking';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Pencil,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProviderSettingsInfo } from '@/types/api/settings';

import { SettingsButton, SettingsInput, SettingsNotice, SettingsSection, StatusPill } from '../settings-controls';
import { AdvancedProviderFields } from './ModelCatalog';
import { ProviderCatalog } from './ProviderCatalog';
import { FieldLabel, IconButton, ProviderMark } from './models-controls';
import type { ModelsSettingsProps } from './models-utils';
import { useProviderActions } from './providers/use-provider-actions';
import {
  CUSTOM_PROVIDER_FIELDS,
  CUSTOM_PROVIDER_KEY,
  providerForm,
} from './models-utils';

export function ProvidersSection({ colors, settings, showBrandLogos, onSettingsChange, onRestart, runtimePolicy }: ModelsSettingsProps) {
  const { t } = useTranslation();
  const {
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
  } = useProviderActions({ settings, onSettingsChange });

  const configured = settings.providers.filter((provider) => provider.configured);
  const unconfigured = settings.providers.filter((provider) => !provider.configured && provider.name !== 'custom');

  const renderProvider = (provider: ProviderSettingsInfo, rowIndex: number) => {
    const open = expanded === provider.name;
    const form = forms[provider.name] ?? providerForm(provider);
    const oauth = provider.auth_type === 'oauth';
    const editingKey = !provider.configured || keyEditing[provider.name];
    return (
      <View key={provider.name} style={[rowIndex > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
        <Pressable onPress={() => toggle(provider)} style={({ pressed }) => [styles.providerRow, pressed && { opacity: 0.7 }]}>
          <ProviderMark colors={colors} label={provider.label} showBrandLogos={showBrandLogos} />
          <View style={styles.rowCopy}>
            <View style={styles.titleLine}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{provider.label}</Text>
              <StatusPill colors={colors} label={provider.configured ? t('settings.values.configured') : t('settings.values.notConfigured')} tone={provider.configured ? 'success' : 'neutral'} />
            </View>
            <Text numberOfLines={1} style={[styles.rowDescription, { color: colors.subtle }]}>{provider.api_base || provider.default_api_base || provider.name}</Text>
          </View>
          {open ? <ChevronUp color={colors.muted} size={17} /> : <ChevronDown color={colors.muted} size={17} />}
        </Pressable>
        {open ? (
          <View style={[styles.providerEditor, { backgroundColor: colors.pressed, borderTopColor: colors.border }]}>
            {oauth ? (
              <View style={[styles.oauthCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={styles.rowCopy}>
                  <Text style={[styles.smallTitle, { color: colors.foreground }]}>{provider.configured ? t('settings.oauth.signedIn') : t('settings.oauth.notSignedIn')}</Text>
                  <Text style={[styles.helpText, { color: colors.subtle }]}>{provider.oauth_account ?? (provider.configured ? t('settings.oauth.signedIn') : t('settings.oauth.signInBeforeSaving'))}</Text>
                </View>
                <SettingsButton
                  colors={colors}
                  disabled={busy !== null || (provider.configured ? false : !provider.oauth_login_supported)}
                  label={busy === provider.name ? t('settings.oauth.signingIn') : provider.configured ? t('settings.oauth.signOut') : t('settings.oauth.signIn')}
                  onPress={() => void runOAuth(provider, provider.configured ? 'logout' : 'login')}
                />
              </View>
            ) : (
              <>
                {provider.is_custom ? <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.providers.customProviderName')}</FieldLabel><SettingsInput colors={colors} onChangeText={(displayName) => updateForm(provider.name, { displayName })} value={form.displayName} /></View> : null}
                <View style={styles.fieldStack}>
                  <FieldLabel colors={colors}>{t('settings.byok.apiKey')}</FieldLabel>
                  {editingKey ? (
                    <View style={styles.inlineField}>
                      <SettingsInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        colors={colors}
                        onChangeText={(apiKey) => updateForm(provider.name, { apiKey })}
                        placeholder={provider.configured ? t('settings.byok.apiKeyConfiguredPlaceholder') : t('settings.byok.apiKeyPlaceholder')}
                        secureTextEntry={!keyVisible[provider.name]}
                        value={form.apiKey}
                      />
                      <IconButton colors={colors} label={keyVisible[provider.name] ? t('settings.byok.hideApiKey') : t('settings.byok.showApiKey')} onPress={() => setKeyVisible((current) => ({ ...current, [provider.name]: !current[provider.name] }))}>
                        {keyVisible[provider.name] ? <EyeOff color={colors.muted} size={15} /> : <Eye color={colors.muted} size={15} />}
                      </IconButton>
                      {provider.configured ? <IconButton colors={colors} label={t('settings.actions.cancel')} onPress={() => {
                        updateForm(provider.name, { apiKey: '' });
                        setKeyEditing((current) => ({ ...current, [provider.name]: false }));
                        setKeyVisible((current) => ({ ...current, [provider.name]: false }));
                      }}><X color={colors.muted} size={15} /></IconButton> : null}
                    </View>
                  ) : (
                    <View style={[styles.secretHint, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <KeyRound color={colors.muted} size={15} />
                      <Text style={[styles.secretText, { color: colors.muted }]}>{provider.api_key_hint ?? t('settings.byok.configuredKeyHint')}</Text>
                      <IconButton colors={colors} label={t('settings.actions.edit')} onPress={() => setKeyEditing((current) => ({ ...current, [provider.name]: true }))}><Pencil color={colors.muted} size={14} /></IconButton>
                    </View>
                  )}
                </View>
                <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.byok.apiBase')}</FieldLabel><SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(apiBase) => updateForm(provider.name, { apiBase })} placeholder={provider.default_api_base ?? 'https://api.example.com/v1'} value={form.apiBase} /></View>
              </>
            )}
            <AdvancedProviderFields colors={colors} fields={provider.advanced_fields ?? []} form={form} onChange={(value) => updateForm(provider.name, value)} />
            <ProviderCatalog colors={colors} provider={provider} />
            {error ? <SettingsNotice colors={colors} error message={error} /> : null}
            <View style={styles.editorActions}>
              <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.actions.cancel')} onPress={() => toggle(provider)} />
              {oauth ? (
                (provider.advanced_fields?.length ?? 0) > 0 ? <SettingsButton colors={colors} disabled={busy !== null} label={busy === provider.name ? t('settings.actions.saving') : t('settings.providers.saveProvider')} onPress={() => void saveProvider(provider)} primary /> : <View />
              ) : (
                <SettingsButton colors={colors} disabled={busy !== null} label={busy === provider.name ? t('settings.actions.saving') : t('settings.providers.saveProvider')} onPress={() => void saveProvider(provider)} primary />
              )}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const allRows = [...configured, ...unconfigured];
  return (
    <SettingsSection colors={colors} title={t('settings.providers.title')}>
      {settings.requires_restart ? (
        <View style={styles.restartRow}>
          <Text style={[styles.rowDescription, { color: colors.muted }]}>
            {runtimePolicy.canRestart
              ? t('settings.status.restartRequired', { defaultValue: 'Provider support changed. Restart the engine when convenient.' })
              : runtimePolicy.restartUnavailableReason}
          </Text>
          <SettingsButton
            colors={colors}
            disabled={!runtimePolicy.canRestart}
            label={runtimePolicy.canRestart ? t('app.system.restartEngine') : runtimePolicy.restartLabel}
            onPress={onRestart}
          />
        </View>
      ) : null}
      {allRows.map(renderProvider)}
      {creatingCustom ? (
        <View style={[styles.providerEditor, { backgroundColor: colors.pressed, borderTopColor: colors.border }]}>
          <View style={styles.editorHeader}><Text style={[styles.editorTitle, { color: colors.foreground }]}>{t('settings.providers.customProvider')}</Text><Pressable onPress={() => setCreatingCustom(false)}><X color={colors.muted} size={18} /></Pressable></View>
          <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.providers.customProviderName')}</FieldLabel><SettingsInput autoFocus colors={colors} onChangeText={(name) => setCustomDraft((current) => ({ ...current, name }))} placeholder="My model provider" value={customDraft.name} /></View>
          <View style={styles.fieldStack}><FieldLabel colors={colors}>{t('settings.byok.apiBase')}</FieldLabel><SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(apiBase) => setCustomDraft((current) => ({ ...current, apiBase }))} placeholder="https://api.example.com/v1" value={customDraft.apiBase} /></View>
          <View style={styles.fieldStack}>
            <FieldLabel colors={colors}>{t('settings.byok.apiKey')}</FieldLabel>
            <View style={styles.inlineField}>
              <SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={(apiKey) => setCustomDraft((current) => ({ ...current, apiKey }))} secureTextEntry={!customKeyVisible} value={customDraft.apiKey} />
              <IconButton colors={colors} label={customKeyVisible ? t('settings.byok.hideApiKey') : t('settings.byok.showApiKey')} onPress={() => setCustomKeyVisible((value) => !value)}>{customKeyVisible ? <EyeOff color={colors.muted} size={15} /> : <Eye color={colors.muted} size={15} />}</IconButton>
            </View>
          </View>
          <AdvancedProviderFields colors={colors} fields={CUSTOM_PROVIDER_FIELDS} form={customDraft} onChange={(value) => setCustomDraft((current) => ({ ...current, ...value }))} />
          {error ? <SettingsNotice colors={colors} error message={error} /> : null}
          <View style={styles.editorActions}><SettingsButton colors={colors} disabled={busy !== null} label={t('settings.actions.cancel')} onPress={() => setCreatingCustom(false)} /><SettingsButton colors={colors} disabled={busy !== null || !customDraft.name.trim() || !customDraft.apiBase.trim()} label={busy === CUSTOM_PROVIDER_KEY ? t('settings.actions.saving') : t('settings.providers.saveProvider')} onPress={() => void createCustom()} primary /></View>
        </View>
      ) : (
        <View style={[styles.sectionFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.helpText, { color: colors.subtle }]}>{t('settings.byok.configuredKeyHint')}</Text>
          <SettingsButton colors={colors} label={t('settings.providers.customProvider')} onPress={beginCustom} />
        </View>
      )}

      {oauthFlow ? (
        <Modal animationType="slide" onRequestClose={closeOAuth} transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.oauthSheet, { backgroundColor: colors.background }]}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t('settings.oauth.finishSignIn')}</Text>
              <Text style={[styles.rowDescription, { color: colors.subtle }]}>{t('settings.oauth.localCodeHelp')}</Text>
              <SettingsInput autoCapitalize="none" autoCorrect={false} colors={colors} onChangeText={setOauthCode} placeholder="Authorization code" secureTextEntry value={oauthCode} />
              {oauthPending ? <SettingsNotice colors={colors} message={t('settings.oauth.pending', { defaultValue: 'Authorization is still pending. Try again shortly.' })} /> : null}
              {error ? <SettingsNotice colors={colors} error message={error} /> : null}
              <View style={styles.editorActions}>
                <SettingsButton colors={colors} disabled={busy !== null} label={t('settings.actions.cancel')} onPress={closeOAuth} />
                <View style={styles.actionGroup}>
                  <IconButton colors={colors} label={t('settings.actions.open')} onPress={() => void Linking.openURL(oauthFlow.authorization_url)}><LogIn color={colors.muted} size={15} /></IconButton>
                  <SettingsButton colors={colors} disabled={busy !== null || !oauthCode.trim()} label={busy ? t('settings.oauth.signingIn') : t('settings.oauth.finishSignIn')} onPress={() => void completeOAuth()} primary />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editorActions: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorTitle: { fontSize: 14, fontWeight: '800' },
  fieldStack: { gap: 6 },
  helpText: { fontSize: 11.5, lineHeight: 17 },
  inlineField: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.36)' },
  oauthCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  oauthSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28, gap: 14 },
  providerEditor: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 13 },
  providerRow: { minHeight: 70, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  restartRow: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowDescription: { fontSize: 11.5, lineHeight: 16 },
  rowTitle: { fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  secretHint: { minHeight: 42, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 11, paddingRight: 3, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secretText: { flex: 1, fontSize: 12 },
  sectionFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3 },
  sheetTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800' },
  smallTitle: { fontSize: 12.5, fontWeight: '700' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
});
