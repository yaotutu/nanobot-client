import {
  METERING_SILENCE_DB,
  MIN_RECORDING_MS,
  type VoiceRecorderError,
} from './voice-recorder-policy';

export interface RecordingAnalysis {
  levelObserved: boolean;
  peakDb: number;
  noInputHintVisible: boolean;
}

export function createRecordingAnalysis(): RecordingAnalysis {
  return {
    levelObserved: false,
    peakDb: Number.NEGATIVE_INFINITY,
    noInputHintVisible: false,
  };
}

export function resetRecordingAnalysis(analysis: RecordingAnalysis): void {
  analysis.levelObserved = false;
  analysis.peakDb = Number.NEGATIVE_INFINITY;
  analysis.noInputHintVisible = false;
}

export function observeRecordingLevel(
  analysis: RecordingAnalysis,
  metering: number,
): boolean {
  analysis.levelObserved = true;
  analysis.peakDb = Math.max(analysis.peakDb, metering);
  if (
    analysis.noInputHintVisible
    && metering >= METERING_SILENCE_DB
  ) {
    analysis.noInputHintVisible = false;
    return true;
  }
  return false;
}

export function shouldShowNoInputHint(analysis: RecordingAnalysis): boolean {
  const silent = analysis.levelObserved && analysis.peakDb < METERING_SILENCE_DB;
  analysis.noInputHintVisible = silent;
  return silent;
}

export function recordingStopError(options: {
  durationMs: number;
  maxReached: boolean;
  analysis: RecordingAnalysis;
}): VoiceRecorderError | null {
  if (options.maxReached) return 'tooLong';
  if (options.durationMs < MIN_RECORDING_MS) return 'tooShort';
  if (
    options.analysis.levelObserved
    && options.analysis.peakDb < METERING_SILENCE_DB
  ) {
    return 'noInput';
  }
  return null;
}
