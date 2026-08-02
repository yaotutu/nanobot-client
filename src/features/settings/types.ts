export interface SettingsPalette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
  errorBackground: string;
  errorText: string;
}

export type SettingsSectionKey =
  | 'overview'
  | 'appearance'
  | 'models'
  | 'image'
  | 'voice'
  | 'web'
  | 'channels'
  | 'runtime'
  | 'security';
