import { describe, expect, it } from 'vitest';

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

  it('creates bounded waveform levels', () => {
    expect(meteringLevel(undefined)).toBe(0.08);
    expect(meteringLevel(-60)).toBe(0.06);
    const waveform = waveformFromMetering(-12, 640, 8);
    expect(waveform).toHaveLength(8);
    expect(waveform.every((value) => value >= 0.06 && value <= 1)).toBe(true);
  });
});
