import { ChannelsSettings } from '@/features/channels';
import {
  imageSettingsRevisionKey,
  modelSettingsRevisionKey,
  runtimeSettingsRevisionKey,
  securitySettingsRevisionKey,
  voiceSettingsRevisionKey,
  webSettingsRevisionKey,
} from '@/features/settings/model/settings-revision';
import type { SettingsSectionKey } from '@/features/settings/types';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type { SettingsPayload } from '@/types/api/settings';
import type { Palette } from '@/ui/palette';

import { AppearanceSettings } from './appearance-settings';
import { ImageSettings } from './image-settings';
import { ModelsSettings } from './models-settings';
import { OverviewSettings } from './overview-settings';
import { RuntimeSettings } from './runtime-settings';
import { SecuritySettings } from './security-settings';
import { VoiceSettings } from './voice-settings';
import { WebSettings } from './web-settings';

interface SettingsSectionRouterProps {
  colors: Palette;
  onChangePreferences: (preferences: LocalPreferences) => void;
  onRestart: () => void;
  onSelectSection: (section: SettingsSectionKey) => void;
  onSettingsChange: (settings: SettingsPayload) => void;
  preferences: LocalPreferences;
  runtimePolicy: RuntimeClientPolicy;
  section: SettingsSectionKey;
  settings: SettingsPayload;
}

export function SettingsSectionRouter({
  colors,
  onChangePreferences,
  onRestart,
  onSelectSection,
  onSettingsChange,
  preferences,
  runtimePolicy,
  section,
  settings,
}: SettingsSectionRouterProps) {
  if (section === 'overview') {
    return <OverviewSettings colors={colors} onSelectSection={onSelectSection} settings={settings} />;
  }
  if (section === 'appearance') {
    return <AppearanceSettings colors={colors} onChange={onChangePreferences} preferences={preferences} />;
  }
  if (section === 'models') {
    return (
      <ModelsSettings
        colors={colors}
        key={modelSettingsRevisionKey(settings)}
        onRestart={onRestart}
        onSettingsChange={onSettingsChange}
        runtimePolicy={runtimePolicy}
        settings={settings}
        showBrandLogos={preferences.brandLogos}
      />
    );
  }
  if (section === 'image') {
    return (
      <ImageSettings
        colors={colors}
        key={imageSettingsRevisionKey(settings)}
        onRestart={onRestart}
        onSelectSection={onSelectSection}
        onSettingsChange={onSettingsChange}
        runtimePolicy={runtimePolicy}
        settings={settings}
      />
    );
  }
  if (section === 'voice') {
    return (
      <VoiceSettings
        colors={colors}
        key={voiceSettingsRevisionKey(settings)}
        onRestart={onRestart}
        onSelectSection={onSelectSection}
        onSettingsChange={onSettingsChange}
        runtimePolicy={runtimePolicy}
        settings={settings}
      />
    );
  }
  if (section === 'web') {
    return (
      <WebSettings
        colors={colors}
        key={webSettingsRevisionKey(settings)}
        onRestart={onRestart}
        onSettingsChange={onSettingsChange}
        runtimePolicy={runtimePolicy}
        settings={settings}
      />
    );
  }
  if (section === 'channels') {
    return <ChannelsSettings colors={colors} showBrandLogos={preferences.brandLogos} />;
  }
  if (section === 'runtime') {
    return (
      <RuntimeSettings
        colors={colors}
        key={runtimeSettingsRevisionKey(settings)}
        onRestart={onRestart}
        onSettingsChange={onSettingsChange}
        runtimePolicy={runtimePolicy}
        settings={settings}
      />
    );
  }
  return (
    <SecuritySettings
      colors={colors}
      key={securitySettingsRevisionKey(settings)}
      onRestart={onRestart}
      onSettingsChange={onSettingsChange}
      runtimePolicy={runtimePolicy}
      settings={settings}
    />
  );
}
