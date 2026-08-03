export type ChannelSetupMode = 'webui' | 'credentials' | 'connect';

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
  inputType?: 'text' | 'number';
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
