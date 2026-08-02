import type { TFunction } from "i18next";

import { currentLocale } from "@/i18n";
import { channelPresentation } from "@/features/channels/channel-presentation";
import type {
  ChannelConfigField,
  ChannelConnectPayload,
  NanobotChannelInstanceInfo,
  NanobotFeatureInfo,
} from '@/types/api/channels';

export type ChannelFilter = "all" | "on" | "off";

export function channelRunning(feature: NanobotFeatureInfo): boolean {
  return feature.running === true || feature.runtime_status === "running";
}

export function channelToggleChecked(feature: NanobotFeatureInfo): boolean {
  return (
    feature.capabilities?.includes("always_enabled") === true ||
    feature.runtime_status === "running" ||
    feature.runtime_status === "starting"
  );
}

export function channelCopy(
  t: TFunction,
  key: string,
  defaultValue: string,
  values: Record<string, string | number> = {},
): string {
  return t(`settings.channels.${key}`, { defaultValue, ...values });
}

export function statusLabel(feature: NanobotFeatureInfo, t: TFunction): string {
  if (feature.runtime_status === "starting") {
    return channelCopy(t, "runtimeStarting", "Starting");
  }
  if (feature.runtime_status === "failed") {
    return channelCopy(t, "runtimeFailed", "Failed");
  }
  if (channelRunning(feature)) return channelCopy(t, "filterOn", "Running");
  if (!feature.installed)
    return channelCopy(t, "notInstalled", "Not installed");
  if (!feature.configured) return channelCopy(t, "needsConfig", "Needs setup");
  if (feature.enabled) return channelCopy(t, "enabled", "Enabled");
  return channelCopy(t, "filterOff", "Not running");
}

export function instanceRunning(instance: NanobotChannelInstanceInfo): boolean {
  return instance.running === true || instance.runtime_status === "running";
}

export function instanceStatusLabel(
  instance: NanobotChannelInstanceInfo,
  t: TFunction,
): string {
  if (instance.runtime_status === "starting") {
    return channelCopy(t, "runtimeStarting", "Starting");
  }
  if (instance.runtime_status === "failed") {
    return channelCopy(t, "runtimeFailed", "Failed");
  }
  if (instanceRunning(instance)) return channelCopy(t, "filterOn", "Running");
  if (!instance.configured) {
    return channelCopy(t, "authorizationRequired", "Authorization required");
  }
  if (instance.enabled) return channelCopy(t, "enabled", "Enabled");
  return channelCopy(t, "filterOff", "Not running");
}

export function instanceDisplayName(
  instance: NanobotChannelInstanceInfo,
): string {
  return instance.display_name?.trim() || instance.name.trim() || instance.id;
}

export function maskFeishuAppId(
  appId: string | undefined,
  t: TFunction,
): string {
  if (!appId) return channelCopy(t, "appIdMissing", "App ID not provided");
  if (appId.length <= 10) return appId;
  return `${appId.slice(0, 7)}...${appId.slice(-4)}`;
}

export function defaultValues(
  fields: ChannelConfigField[],
  values: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      values?.[field.key] ??
        field.defaultValue ??
        field.options?.[0]?.value ??
        "",
    ]),
  );
}

export function featureSearchText(
  feature: NanobotFeatureInfo,
  t: TFunction,
): string {
  const presentation = channelPresentation(feature);
  return [
    feature.name,
    feature.display_name,
    presentation.displayName,
    presentation.description,
    presentation.requirements,
    feature.status,
    feature.runtime_status,
    statusLabel(feature, t),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase(currentLocale());
}

export function channelConnectInstruction(name: string, t: TFunction): string {
  if (name === "weixin") {
    return channelCopy(
      t,
      "connectInstructions.weixin",
      "Scan the QR code with WeChat. After sign-in, the account state is stored securely on the nanobot server.",
    );
  }
  if (name === "feishu") {
    return channelCopy(
      t,
      "connectInstructions.feishu",
      "Scan the QR code with Feishu or Lark and finish authorization on your phone.",
    );
  }
  if (name === "whatsapp") {
    return channelCopy(
      t,
      "connectInstructions.whatsapp",
      "Scan the QR code with WhatsApp and wait for the connection to finish.",
    );
  }
  return channelCopy(
    t,
    "connectInstructions.default",
    "Scan the QR code with the corresponding mobile app and wait for the connection to finish.",
  );
}

export function channelConnectStatusLabel(
  connect: ChannelConnectPayload | null,
  t: TFunction,
): string | null {
  if (!connect) return null;
  if (connect.message?.trim()) return connect.message.trim();
  if (connect.status === "pending") {
    return channelCopy(
      t,
      "connectStatus.pending",
      "Waiting for scan or authorization…",
    );
  }
  if (connect.status === "succeeded") {
    return channelCopy(t, "connectStatus.succeeded", "Connected.");
  }
  if (connect.status === "expired") {
    return channelCopy(
      t,
      "connectStatus.expired",
      "The QR code expired. Generate a new one.",
    );
  }
  if (connect.status === "cancelled") {
    return channelCopy(t, "connectStatus.cancelled", "Connection cancelled.");
  }
  if (connect.status === "failed") {
    return channelCopy(
      t,
      "connectStatus.failed",
      "Connection failed. Try again.",
    );
  }
  return connect.status;
}
