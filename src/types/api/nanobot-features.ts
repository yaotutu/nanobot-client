export type ChannelRuntimeStatus =
  | 'running'
  | 'starting'
  | 'failed'
  | 'stopped'
  | string;

export interface ChannelSetupContractField {
  key: string;
  field: string;
  kind: 'string' | 'secret' | 'int' | 'bool' | 'list' | 'enum' | string;
  choices: string[];
  required: boolean;
  default_value?: string;
}

export interface ChannelSetupContract {
  fields: ChannelSetupContractField[];
  official_url?: string;
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
  type: 'channel' | 'feature' | string;
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
  status: 'enabled' | 'missing_dependency' | 'not_enabled' | string;
  install_supported: boolean;
  requires_restart: boolean;
}

export interface NanobotFeaturesPayload {
  features: NanobotFeatureInfo[];
  enabled_count: number;
  requires_restart?: boolean;
  last_action?: { ok: boolean; message: string; enabled?: boolean };
}
