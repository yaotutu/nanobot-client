export type VoiceRecorderError =
  | 'unsupported'
  | 'permission'
  | 'notConfigured'
  | 'tooLong'
  | 'tooShort'
  | 'noInput'
  | 'noDevice'
  | 'failed';

export const MIN_RECORDING_MS = 650;
export const NO_INPUT_HINT_MS = 1_100;
export const DEFAULT_MAX_DURATION_SEC = 120;
export const DEFAULT_MAX_UPLOAD_MB = 25;
export const METERING_SILENCE_DB = -55;
export const WAVEFORM_BARS = 16;

export function voiceErrorFromUnknown(error: unknown): VoiceRecorderError {
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : String(error).toLowerCase();
  if (message.includes('permission') || message.includes('denied') || message.includes('not allowed')) {
    return 'permission';
  }
  if (message.includes('not_configured') || message.includes('disabled')) return 'notConfigured';
  if (message.includes('duration') || message.includes('too_long')) return 'tooLong';
  if (message.includes('missing_audio') || message.includes('empty')) return 'noInput';
  if (message.includes('no device') || message.includes('no_device') || message.includes('input')) {
    return 'noDevice';
  }
  return 'failed';
}

export function meteringLevel(db?: number): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0.08;
  return Math.max(0.06, Math.min(1, (db + 60) / 60));
}

export function waveformFromMetering(
  db: number | undefined,
  durationMs: number,
  bars = WAVEFORM_BARS,
): number[] {
  const level = meteringLevel(db);
  const phase = Math.floor(durationMs / 80);
  return Array.from({ length: bars }, (_, index) => {
    const ripple = 0.52 + Math.abs(Math.sin((index + phase) * 0.82)) * 0.48;
    return Math.max(0.06, Math.min(1, level * ripple));
  });
}

export function boundedVoiceDurationSec(value?: number): number {
  return Math.max(1, Math.min(600, value || DEFAULT_MAX_DURATION_SEC));
}

export function boundedVoiceUploadMb(value?: number): number {
  return Math.max(1, value || DEFAULT_MAX_UPLOAD_MB);
}
