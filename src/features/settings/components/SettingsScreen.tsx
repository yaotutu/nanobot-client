import {
  Bot,
  Globe2,
  Image as ImageIcon,
  LayoutDashboard,
  MessageCircle,
  Mic,
  Palette as PaletteIcon,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useSettingsCatalog } from '@/features/settings/hooks/use-settings-catalog';
import { useSettingsUsage } from '@/features/settings/hooks/use-settings-usage';
import type { SettingsSectionKey } from '@/features/settings/types';
import type { Palette } from '@/ui/palette';
import type { LocalPreferences } from "@/stores/local-preferences-store";
import {
  resolveRuntimeClientPolicy,
  type RuntimeMetadata,
} from "@/services/runtime/runtime-capabilities";
import type { SettingsPayload } from '@/types/api/settings';

import { AppearanceSettings } from "./appearance-settings";
import { ChannelsSettings } from "@/features/channels/components/ChannelsSettings";
import { ImageSettings } from "./image-settings";
import { ModelsSettings } from "./models-settings";
import { OverviewSettings } from "./overview-settings";
import { RuntimeSettings } from "./runtime-settings";
import { SecuritySettings } from "./security-settings";
import { VoiceSettings } from "./voice-settings";
import { WebSettings } from "./web-settings";

const SECTIONS = [
  { key: "overview" as const, translationKey: "overview", icon: LayoutDashboard },
  { key: "appearance" as const, translationKey: "appearance", icon: PaletteIcon },
  { key: "models" as const, translationKey: "models", icon: Bot },
  { key: "image" as const, translationKey: "image", icon: ImageIcon },
  { key: "voice" as const, translationKey: "voice", icon: Mic },
  { key: "web" as const, translationKey: "browser", icon: Globe2 },
  { key: "channels" as const, translationKey: "channels", icon: MessageCircle },
  { key: "runtime" as const, translationKey: "runtime", icon: Server },
  { key: "security" as const, translationKey: "advanced", icon: ShieldCheck },
];

interface SettingsScreenProps {
  colors: Palette;
  preferences: LocalPreferences;
  onChangePreferences: (preferences: LocalPreferences) => void;
  onRestart: () => void;
  onSettingsChange?: (settings: SettingsPayload) => void;
  runtimeMetadata?: RuntimeMetadata;
}

export function SettingsScreen({
  colors,
  preferences,
  onChangePreferences,
  onRestart,
  onSettingsChange,
  runtimeMetadata,
}: SettingsScreenProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSectionKey>("overview");
  const {
    applySettings,
    applyUsage,
    error,
    load,
    loading,
    refreshing,
    settings,
  } = useSettingsCatalog({ onSettingsChange, runtimeMetadata });
  useSettingsUsage({
    enabled: section === 'overview' && settings !== null,
    onUsage: applyUsage,
  });

  const runtimePolicy = resolveRuntimeClientPolicy(settings, runtimeMetadata);
  const content = settings
    ? (() => {
        if (section === "overview")
          return (
            <OverviewSettings
              colors={colors}
              onSelectSection={setSection}
              settings={settings}
            />
          );
        if (section === "appearance")
          return (
            <AppearanceSettings
              colors={colors}
              onChange={onChangePreferences}
              preferences={preferences}
            />
          );
        if (section === "models")
          return (
            <ModelsSettings
              runtimePolicy={runtimePolicy}
              key={`${settings.model_call_order.join(",")}:${settings.model_presets.map((preset) => `${preset.name}:${preset.provider}:${preset.model}:${preset.label}`).join("|")}:${settings.providers.map((provider) => `${provider.name}:${provider.configured}:${provider.api_base ?? ""}:${provider.oauth_account ?? ""}`).join("|")}`}
              colors={colors}
              onRestart={onRestart}
              onSettingsChange={applySettings}
              settings={settings}
              showBrandLogos={preferences.brandLogos}
            />
          );
        if (section === "image")
          return (
            <ImageSettings
              runtimePolicy={runtimePolicy}
              key={`${settings.image_generation.provider}:${settings.image_generation.model}:${settings.image_generation.enabled}`}
              colors={colors}
              onRestart={onRestart}
              onSelectSection={setSection}
              onSettingsChange={applySettings}
              settings={settings}
            />
          );
        if (section === "voice")
          return (
            <VoiceSettings
              runtimePolicy={runtimePolicy}
              key={`${settings.transcription?.provider ?? ""}:${settings.transcription?.model ?? ""}:${settings.transcription?.enabled ?? false}`}
              colors={colors}
              onRestart={onRestart}
              onSelectSection={setSection}
              onSettingsChange={applySettings}
              settings={settings}
            />
          );
        if (section === "web")
          return (
            <WebSettings
              runtimePolicy={runtimePolicy}
              key={`${settings.web_search.provider}:${settings.web_search.max_results}:${settings.web_search.timeout}:${settings.web.fetch.use_jina_reader}`}
              colors={colors}
              onRestart={onRestart}
              onSettingsChange={applySettings}
              settings={settings}
            />
          );
        if (section === "channels")
          return (
            <ChannelsSettings
              colors={colors}
              showBrandLogos={preferences.brandLogos}
            />
          );
        if (section === "runtime")
          return (
            <RuntimeSettings
              key={`${settings.agent.bot_name}:${settings.agent.bot_icon}:${settings.agent.timezone}`}
              runtimePolicy={runtimePolicy}
              colors={colors}
              onRestart={onRestart}
              onSettingsChange={applySettings}
              settings={settings}
            />
          );
        return (
          <SecuritySettings
            key={`${settings.advanced.webui_allow_local_service_access}:${settings.advanced.webui_default_access_mode}`}
            runtimePolicy={runtimePolicy}
            colors={colors}
            onRestart={onRestart}
            onSettingsChange={applySettings}
            settings={settings}
          />
        );
      })()
    : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
        <ScrollView
          contentContainerStyle={styles.navContent}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {SECTIONS.map(({ key, translationKey, icon: Icon }) => {
            const active = section === key;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                key={key}
                onPress={() => setSection(key)}
                style={({ pressed }) => [
                  styles.navItem,
                  {
                    backgroundColor: active
                      ? colors.foreground
                      : pressed
                        ? colors.pressed
                        : colors.card,
                  },
                ]}
              >
                <Icon
                  color={active ? colors.background : colors.muted}
                  size={15}
                  strokeWidth={1.9}
                />
                <Text
                  style={[
                    styles.navText,
                    { color: active ? colors.background : colors.muted },
                  ]}
                >
                  {t(`settings.nav.${translationKey}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          accessibilityLabel={t("settings.channels.checkConnection")}
          disabled={refreshing}
          onPress={() => void load('refresh')}
          style={styles.refreshButton}
        >
          {refreshing ? (
            <ActivityIndicator color={colors.muted} size="small" />
          ) : (
            <RefreshCw color={colors.muted} size={16} />
          )}
        </Pressable>
      </View>
      {error ? (
        <View
          style={[styles.error, { backgroundColor: colors.errorBackground }]}
        >
          <Text style={[styles.errorText, { color: colors.errorText }]}>
            {error}
          </Text>
          <Pressable onPress={() => void load()}>
            <Text style={[styles.retry, { color: colors.errorText }]}>
              {t("settings.channels.checkConnection")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {settings &&
      !runtimePolicy.canRestart &&
      (settings.requires_restart ||
        settings.apply_state?.status === "pending") ? (
        <View
          style={[
            styles.capabilityNotice,
            { backgroundColor: colors.pressed, borderColor: colors.border },
          ]}
        >
          <Text
            selectable
            style={[styles.capabilityNoticeText, { color: colors.muted }]}
          >
            {runtimePolicy.restartUnavailableReason}
          </Text>
        </View>
      ) : null}
      {loading && !settings ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.muted} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            {t("settings.status.loading")}
          </Text>
        </View>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: {
    minHeight: 55,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },
  navContent: { paddingHorizontal: 12, paddingVertical: 9, gap: 7 },
  navItem: {
    minHeight: 35,
    borderRadius: 18,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  navText: { fontSize: 11.5, fontWeight: "700" },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 3,
  },
  error: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 14,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  retry: { fontSize: 12, fontWeight: "700" },
  capabilityNotice: {
    marginHorizontal: 14,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  capabilityNoticeText: { fontSize: 12, lineHeight: 17 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { fontSize: 12.5 },
});
