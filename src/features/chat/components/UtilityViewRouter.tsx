import { AutomationsScreen } from '@/features/automations/components/AutomationsScreen';
import { AppsScreen } from '@/features/capabilities/components/AppsScreen';
import { SettingsScreen } from '@/features/settings/components/SettingsScreen';
import { SkillsScreen } from '@/features/skills/components/SkillsScreen';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import type { BootstrapResponse } from '@/types/api/runtime';
import type { SettingsPayload } from '@/types/api/settings';
import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type { Palette } from '@/ui/palette';

export type UtilityView = 'chat' | 'apps' | 'skills' | 'automations' | 'settings';

interface UtilityViewRouterProps {
  bootstrap: BootstrapResponse;
  colors: Palette;
  onBackToChat: () => void;
  onChangePreferences: (next: LocalPreferences) => void;
  onOpenLinkedChat: (sessionKey: string) => void;
  onRestart: () => void;
  onSettingsChange: (settings: SettingsPayload) => void;
  preferences: LocalPreferences;
  runtimePolicy: RuntimeClientPolicy;
  view: Exclude<UtilityView, 'chat'>;
}

export function UtilityViewRouter(props: UtilityViewRouterProps) {
  switch (props.view) {
    case 'apps':
      return (
        <AppsScreen
          key={`apps:${props.bootstrap.token}`}
          colors={props.colors}
          onBackToChat={props.onBackToChat}
          onRestart={props.onRestart}
          restartPolicy={props.runtimePolicy}
        />
      );
    case 'skills':
      return <SkillsScreen colors={props.colors} />;
    case 'automations':
      return (
        <AutomationsScreen
          colors={props.colors}
          onOpenLinkedChat={props.onOpenLinkedChat}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          colors={props.colors}
          onChangePreferences={props.onChangePreferences}
          onRestart={props.onRestart}
          onSettingsChange={props.onSettingsChange}
          preferences={props.preferences}
          runtimeMetadata={props.bootstrap}
        />
      );
  }
}
