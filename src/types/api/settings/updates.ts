export interface VersionCheckResult {
  updateAvailable: {
    currentVersion: string;
    latestVersion: string;
    pypiUrl?: string;
  } | null;
}

export interface SettingsUpdate {
  modelPreset?: string | null;
  model?: string;
  provider?: string;
  contextWindowTokens?: number;
  timezone?: string;
  botName?: string;
  botIcon?: string;
  toolHintMaxLength?: number;
}
