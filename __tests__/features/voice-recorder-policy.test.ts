import { describe, expect, it } from 'vitest';

import {
  createRecordingAnalysis,
  observeRecordingLevel,
  recordingStopError,
  shouldShowNoInputHint,
} from '@/features/chat/voice/recording-analysis';
import {
  boundedVoiceDurationSec,
  boundedVoiceUploadMb,
  meteringLevel,
  voiceErrorFromUnknown,
  waveformFromMetering,
} from '@/features/chat/voice/voice-recorder-policy';

describe('voice recorder policy', () => {
  it('maps native and gateway errors to stable UI errors', () => {
    expect(voiceErrorFromUnknown(new Error('Permission denied'))).toBe('permission');
    expect(voiceErrorFromUnknown('not_configured')).toBe('notConfigured');
    expect(voiceErrorFromUnknown('missing_audio')).toBe('noInput');
    expect(voiceErrorFromUnknown('unexpected')).toBe('failed');
  });

  it('bounds runtime limits', () => {
    expect(boundedVoiceDurationSec(0)).toBe(120);
    expect(boundedVoiceDurationSec(999)).toBe(600);
    expect(boundedVoiceUploadMb(-2)).toBe(1);
  });

  it('tracks silence and chooses stop validation errors in priority order', () => {
    const analysis = createRecordingAnalysis();
    observeRecordingLevel(analysis, -70);
    expect(shouldShowNoInputHint(analysis)).toBe(true);
    expect(recordingStopError({ durationMs: 1_000, maxReached: false, analysis }))
      .toBe('noInput');
    expect(recordingStopError({ durationMs: 100, maxReached: true, analysis }))
      .toBe('tooLong');

    expect(observeRecordingLevel(analysis, -20)).toBe(true);
    expect(recordingStopError({ durationMs: 100, maxReached: false, analysis }))
      .toBe('tooShort');
    expect(recordingStopError({ durationMs: 1_000, maxReached: false, analysis }))
      .toBeNull();
  });

  it('creates bounded waveform levels', () => {
    expect(meteringLevel(undefined)).toBe(0.08);
    expect(meteringLevel(-60)).toBe(0.06);
    const waveform = waveformFromMetering(-12, 640, 8);
    expect(waveform).toHaveLength(8);
    expect(waveform.every((value) => value >= 0.06 && value <= 1)).toBe(true);
  });
});
