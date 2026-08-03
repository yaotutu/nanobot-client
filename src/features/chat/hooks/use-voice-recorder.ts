import { useMemo } from 'react';

import { useVoiceRecorderGestures } from '@/features/chat/hooks/use-voice-recorder-gestures';
import { useVoiceRecordingLifecycle } from '@/features/chat/hooks/use-voice-recording-lifecycle';
import type {
  UseVoiceRecorderOptions,
  VoiceRecorderController,
} from '@/features/chat/voice/types';
import {
  waveformFromMetering,
  WAVEFORM_BARS,
} from '@/features/chat/voice/voice-recorder-policy';

export type {
  UseVoiceRecorderOptions,
  VoiceRecorderController,
  VoiceRecorderPhase,
} from '@/features/chat/voice/types';
export type { VoiceRecorderError } from '@/features/chat/voice/voice-recorder-policy';

export function useVoiceRecorder({
  disabled = false,
  onTranscribeAudio,
  ...options
}: UseVoiceRecorderOptions): VoiceRecorderController {
  const recording = useVoiceRecordingLifecycle({
    disabled,
    onTranscribeAudio,
    ...options,
  });
  const gestures = useVoiceRecorderGestures({
    disabled,
    currentPhase: recording.currentPhase,
    startRecording: recording.startRecording,
    stopRecording: recording.stopRecording,
  });

  return useMemo(() => ({
    phase: recording.phase,
    elapsedMs: recording.phase === 'recording'
      ? recording.durationMillis
      : 0,
    waveform: recording.phase === 'recording'
      ? waveformFromMetering(recording.metering, recording.durationMillis)
      : Array(WAVEFORM_BARS).fill(0.08),
    disabled: disabled || !onTranscribeAudio || recording.phase === 'transcribing',
    ...gestures,
  }), [
    disabled,
    gestures,
    onTranscribeAudio,
    recording.durationMillis,
    recording.metering,
    recording.phase,
  ]);
}
