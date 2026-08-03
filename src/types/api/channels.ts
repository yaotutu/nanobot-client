import type { NanobotFeaturesPayload } from './nanobot-features';

export interface ChannelValidationCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'skipped' | string;
  message?: string;
  action_url?: string;
}

export interface ChannelValidationPayload {
  name: string;
  status:
    | 'connected'
    | 'configured'
    | 'needs_setup'
    | 'invalid'
    | 'unsupported'
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
    action: 'approve' | 'deny' | string;
    message: string;
    code?: string;
    channel?: string;
    sender_id?: string;
  };
}

export interface ChannelConnectPayload {
  session_id: string;
  instance_id?: string;
  status: 'pending' | 'succeeded' | 'expired' | 'cancelled' | 'failed';
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
