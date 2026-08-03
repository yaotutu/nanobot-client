import type { VoiceRecorderError } from './voice-recorder-policy';

export type VoiceRecorderPhase = 'idle' | 'recording' | 'transcribing';

export interface UseVoiceRecorderOptions {
  disabled?: boolean;
  maxDurationSec?: number;
  maxUploadMb?: number;
  onError: (error: VoiceRecorderError) => void;
  onClearError: () => void;
  onTranscript: (text: string) => void;
  onTranscribeAudio?: (
    dataUrl: string,
    options?: { durationMs?: number },
  ) => Promise<string>;
}

export interface VoiceRecorderController {
  phase: VoiceRecorderPhase;
  elapsedMs: number;
  waveform: number[];
  disabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onPressOut: () => void;
}
