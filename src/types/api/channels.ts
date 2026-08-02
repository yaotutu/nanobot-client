export type ChannelRuntimeStatus =
  "running" | "starting" | "failed" | "stopped" | string;

export interface ChannelSetupContractField {
  key: string;
  field: string;
  kind: "string" | "secret" | "int" | "bool" | "list" | "enum" | string;
  choices: string[];
  required: boolean;
  default_value?: string;
}

export interface ChannelSetupContract {
  fields: ChannelSetupContractField[];
  official_url?: string;
}

export type ChannelSetupMode = "webui" | "credentials" | "connect";

export interface ChannelConfigOption {
  value: string;
  label: string;
}

export interface ChannelConfigField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
  help?: string;
  inputType?: "text" | "number";
  defaultValue?: string;
  options?: ChannelConfigOption[];
}

export interface ChannelSetupAction {
  id: string;
  label: string;
  url?: string;
  copyText?: string;
  logoUrl?: string;
}

export interface ChannelProviderPreset {
  id: string;
  label: string;
  values: Record<string, string>;
}

export interface ChannelSetupPresentation {
  mode?: ChannelSetupMode;
  primaryActionLabel?: string;
  command?: string;
  docsUrl?: string;
  docsLabel?: string;
  docsLogoUrl?: string;
  officialUrl?: string;
  officialLabel?: string;
  summary?: string;
  tryIt?: string;
  steps: string[];
  fields?: ChannelConfigField[];
  manualFields?: ChannelConfigField[];
  actions?: ChannelSetupAction[];
  presets?: ChannelProviderPreset[];
}

export interface ChannelPresentation {
  displayName: string;
  initials: string;
  color: string;
  logoUrl?: string;
  description?: string;
  requirements?: string;
  canConnectBeforeConfigured?: boolean;
  setup: ChannelSetupPresentation;
}

export interface NanobotChannelInstanceInfo {
  id: string;
  name: string;
  display_name?: string;
  avatar_url?: string;
  enabled: boolean;
  running?: boolean;
  runtime_status?: ChannelRuntimeStatus;
  runtime_error?: string;
  configured: boolean;
  config_values: Record<string, string>;
  configured_fields: string[];
}

export interface NanobotFeatureInfo {
  name: string;
  display_name: string;
  capabilities?: string[];
  settings_visible?: boolean;
  webui?: string;
  type: "channel" | "feature" | string;
  enabled: boolean;
  running?: boolean;
  runtime_status?: ChannelRuntimeStatus;
  runtime_error?: string;
  configured?: boolean;
  config_values?: Record<string, string>;
  configured_fields?: string[];
  setup?: ChannelSetupContract;
  instances?: NanobotChannelInstanceInfo[];
  installed: boolean;
  ready: boolean;
  status: "enabled" | "missing_dependency" | "not_enabled" | string;
  install_supported: boolean;
  requires_restart: boolean;
}

export interface NanobotFeaturesPayload {
  features: NanobotFeatureInfo[];
  enabled_count: number;
  requires_restart?: boolean;
  last_action?: { ok: boolean; message: string; enabled?: boolean };
}

export interface ChannelValidationCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "skipped" | string;
  message?: string;
  action_url?: string;
}

export interface ChannelValidationPayload {
  name: string;
  status:
    | "connected"
    | "configured"
    | "needs_setup"
    | "invalid"
    | "unsupported"
    | string;
  checks: ChannelValidationCheck[];
  identity?: {
    name?: string;
    workspace?: string;
    account?: string;
    avatar_url?: string;
  };
  missing_fields: string[];
  can_enable: boolean;
  requires_restart: boolean;
  checked_at?: string;
  message?: string;
}

export interface PairingRequestInfo {
  code: string;
  channel: string;
  sender_id: string;
  created_at_ms?: number | null;
  expires_at_ms?: number | null;
  expires_in_seconds?: number | null;
}

export interface PairingPayload {
  requests: PairingRequestInfo[];
  last_action?: {
    ok: boolean;
    action: "approve" | "deny" | string;
    message: string;
    code?: string;
    channel?: string;
    sender_id?: string;
  };
}

export interface ChannelConnectPayload {
  session_id: string;
  instance_id?: string;
  status: "pending" | "succeeded" | "expired" | "cancelled" | "failed";
  message?: string;
  qr_url?: string;
  domain?: string;
  interval_ms?: number;
  expires_at_ms?: number;
  app_id?: string;
  account?: string;
  nanobot_features?: NanobotFeaturesPayload;
}

export interface ChannelConfigurePayload {
  name: string;
  saved: boolean;
  saved_keys?: string[];
  nanobot_features?: NanobotFeaturesPayload;
}

