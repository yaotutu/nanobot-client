import type { WebuiDefaultAccessMode } from '../workspaces';

export type RestartBehavior = 'none' | 'nextTurn' | 'engineRestart' | 'appRestart';
export type SettingsApplyStatus =
  | 'idle'
  | 'pending'
  | 'applying'
  | 'restarting_engine'
  | 'requires_app_restart';

export interface ApiServicePayload {
  installed: boolean;
  running: boolean;
  managed: boolean;
  host: string;
  port: number;
  timeout: number;
  api_key_hint?: string | null;
  endpoint: string;
  command: string;
  log_path?: string | null;
  last_action?: 'started' | 'stopped' | string;
}

export interface NetworkSafetySettingsUpdate {
  webuiAllowLocalServiceAccess: boolean;
  webuiDefaultAccessMode: WebuiDefaultAccessMode;
}
