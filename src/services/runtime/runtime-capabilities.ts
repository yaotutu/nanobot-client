import type { RuntimeCapabilities, RuntimeSurface } from '@/types/api';

import i18n from '@/i18n';

export interface RuntimeMetadata {
  surface?: RuntimeSurface;
  runtime_surface?: RuntimeSurface;
  runtime_capabilities?: Partial<RuntimeCapabilities> | null;
}

export interface RuntimeClientPolicy {
  surface: RuntimeSurface;
  capabilities: RuntimeCapabilities;
  isNativeHost: boolean;
  canRestart: boolean;
  restartLabel: string;
  restartUnavailableReason: string | null;
  declaredHostActions: {
    folderPicker: boolean;
    openLogs: boolean;
    exportDiagnostics: boolean;
  };
}

const EMPTY_CAPABILITIES: RuntimeCapabilities = {
  can_restart_engine: false,
  can_pick_folder: false,
  can_open_logs: false,
  can_export_diagnostics: false,
};

function resolveSurface(primary?: RuntimeMetadata | null, fallback?: RuntimeMetadata | null): RuntimeSurface {
  return primary?.surface
    ?? primary?.runtime_surface
    ?? fallback?.surface
    ?? fallback?.runtime_surface
    ?? 'browser';
}

export function resolveRuntimeCapabilities(
  primary?: RuntimeMetadata | null,
  fallback?: RuntimeMetadata | null,
): RuntimeCapabilities {
  return {
    ...EMPTY_CAPABILITIES,
    ...(fallback?.runtime_capabilities ?? {}),
    ...(primary?.runtime_capabilities ?? {}),
  };
}

export function resolveRuntimeClientPolicy(
  primary?: RuntimeMetadata | null,
  fallback?: RuntimeMetadata | null,
): RuntimeClientPolicy {
  const surface = resolveSurface(primary, fallback);
  const capabilities = resolveRuntimeCapabilities(primary, fallback);
  const isNativeHost = surface === 'native';

  if (!isNativeHost) {
    return {
      surface,
      capabilities,
      isNativeHost,
      canRestart: true,
      restartLabel: i18n.t('app.system.restart'),
      restartUnavailableReason: null,
      declaredHostActions: {
        folderPicker: false,
        openLogs: false,
        exportDiagnostics: false,
      },
    };
  }

  const restartUnavailableReason = capabilities.can_restart_engine
    ? i18n.t('app.system.mobileRestartBridgeUnavailable', {
        defaultValue: 'The server reports native restart support, but this mobile client has no local host bridge. Restart the engine on the device running nanobot.',
      })
    : i18n.t('app.system.remoteRestartUnavailable', {
        defaultValue: 'This native host does not expose remote restart. Restart the engine on the device running nanobot.',
      });

  return {
    surface,
    capabilities,
    isNativeHost,
    canRestart: false,
    restartLabel: i18n.t('app.system.restartOnHost', { defaultValue: 'Restart on host' }),
    restartUnavailableReason,
    declaredHostActions: {
      folderPicker: capabilities.can_pick_folder,
      openLogs: capabilities.can_open_logs,
      exportDiagnostics: capabilities.can_export_diagnostics,
    },
  };
}

export function mergeRuntimeMetadata<T extends RuntimeMetadata>(
  payload: T,
  fallback?: RuntimeMetadata | null,
): T {
  const surface = resolveSurface(payload, fallback);
  return {
    ...payload,
    surface: payload.surface ?? fallback?.surface,
    runtime_surface: payload.runtime_surface ?? fallback?.runtime_surface ?? surface,
    runtime_capabilities: resolveRuntimeCapabilities(payload, fallback),
  };
}

export function restartRequirementDescription(
  policy: RuntimeClientPolicy,
  availableDescription = i18n.t('settings.models.savedRestartApply'),
): string {
  return policy.canRestart
    ? availableDescription
    : policy.restartUnavailableReason ?? availableDescription;
}
