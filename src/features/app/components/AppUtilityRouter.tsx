import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { AppUtilityView } from '@/features/app/model/navigation';
import { createDeferredComponent } from '@/hooks/use-deferred-component';
import type { RuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import type { BootstrapResponse } from '@/types/api/runtime';
import type { SettingsPayload } from '@/types/api/settings';
import type { Palette } from '@/ui/palette';

/**
 * 工具页不属于聊天首屏。每个页面使用显式异步组件加载器，用户第一次打开对应页面时才执行模块。
 * 不使用 React.lazy/Suspense，避免旧 Android + Fabric 在懒加载树提交阶段出现原生崩溃。
 */
const DeferredAutomationsScreen = createDeferredComponent(() => import(
  '@/features/automations/components/AutomationsScreen'
).then(({ AutomationsScreen }) => AutomationsScreen));
const DeferredAppsScreen = createDeferredComponent(() => import(
  '@/features/capabilities/components/AppsScreen'
).then(({ AppsScreen }) => AppsScreen));
const DeferredSettingsScreen = createDeferredComponent(() => import(
  '@/features/settings/components/SettingsScreen'
).then(({ SettingsScreen }) => SettingsScreen));
const DeferredSkillsScreen = createDeferredComponent(() => import(
  '@/features/skills/components/SkillsScreen'
).then(({ SkillsScreen }) => SkillsScreen));

interface AppUtilityRouterProps {
  bootstrap: BootstrapResponse;
  colors: Palette;
  onBackToChat: () => void;
  onChangePreferences: (next: LocalPreferences) => void;
  onOpenLinkedChat: (sessionKey: string) => void;
  onRestart: () => void;
  onSettingsChange: (settings: SettingsPayload) => void;
  preferences: LocalPreferences;
  runtimePolicy: RuntimeClientPolicy;
  view: Exclude<AppUtilityView, 'chat'>;
}

export function AppUtilityRouter(props: AppUtilityRouterProps) {
  const fallback = <UtilityLoading colors={props.colors} />;

  switch (props.view) {
    case 'apps':
      return (
        <DeferredAppsScreen
          key={`apps:${props.bootstrap.token}`}
          componentProps={{
            colors: props.colors,
            onBackToChat: props.onBackToChat,
            onRestart: props.onRestart,
            restartPolicy: props.runtimePolicy,
          }}
          enabled
          fallback={fallback}
        />
      );
    case 'skills':
      return (
        <DeferredSkillsScreen
          componentProps={{ colors: props.colors }}
          enabled
          fallback={fallback}
        />
      );
    case 'automations':
      return (
        <DeferredAutomationsScreen
          componentProps={{
            colors: props.colors,
            onOpenLinkedChat: props.onOpenLinkedChat,
          }}
          enabled
          fallback={fallback}
        />
      );
    case 'settings':
      return (
        <DeferredSettingsScreen
          componentProps={{
            colors: props.colors,
            onChangePreferences: props.onChangePreferences,
            onRestart: props.onRestart,
            onSettingsChange: props.onSettingsChange,
            preferences: props.preferences,
            runtimeMetadata: props.bootstrap,
          }}
          enabled
          fallback={fallback}
        />
      );
  }
}

function UtilityLoading({ colors }: { colors: Palette }) {
  return (
    <View accessibilityRole="progressbar" style={styles.loading}>
      <ActivityIndicator color={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
