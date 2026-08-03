import { createRecordingAnalysis, type RecordingAnalysis } from './recording-analysis';
import type { VoiceRecorderPhase } from './types';

export interface RecorderRuntime {
  phase: VoiceRecorderPhase;
  mounted: boolean;
  startedAt: number;
  startPending: boolean;
  stopPending: boolean;
  stopAfterStart: boolean;
  discardAfterStart: boolean;
  discardRequested: boolean;
  maxReached: boolean;
  analysis: RecordingAnalysis;
}

export function createRecorderRuntime(): RecorderRuntime {
  return {
    phase: 'idle',
    mounted: true,
    startedAt: 0,
    startPending: false,
    stopPending: false,
    stopAfterStart: false,
    discardAfterStart: false,
    discardRequested: false,
    maxReached: false,
    analysis: createRecordingAnalysis(),
  };
}
