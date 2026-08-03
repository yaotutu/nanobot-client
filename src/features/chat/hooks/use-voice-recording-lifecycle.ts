import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  enableRecordingAudioMode,
  restorePlaybackAudioMode,
} from '@/features/chat/voice/audio-mode-lifecycle';
import {
  observeRecordingLevel,
  recordingStopError,
  resetRecordingAnalysis,
  shouldShowNoInputHint,
} from '@/features/chat/voice/recording-analysis';
import { encodeRecordingFile } from '@/features/chat/voice/recording-file';
import {
  createRecorderRuntime,
  type RecorderRuntime,
} from '@/features/chat/voice/recorder-runtime';
import { VoiceRecorderTimers } from '@/features/chat/voice/recorder-timers';
import type {
  UseVoiceRecorderOptions,
  VoiceRecorderPhase,
} from '@/features/chat/voice/types';
import {
  boundedVoiceDurationSec,
  boundedVoiceUploadMb,
  DEFAULT_MAX_DURATION_SEC,
  DEFAULT_MAX_UPLOAD_MB,
  NO_INPUT_HINT_MS,
  voiceErrorFromUnknown,
} from '@/features/chat/voice/voice-recorder-policy';

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export function useVoiceRecordingLifecycle({
  disabled = false,
  maxDurationSec = DEFAULT_MAX_DURATION_SEC,
  maxUploadMb = DEFAULT_MAX_UPLOAD_MB,
  onError,
  onClearError,
  onTranscript,
  onTranscribeAudio,
}: UseVoiceRecorderOptions) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 80);
  const [phase, setPhase] = useState<VoiceRecorderPhase>('idle');
  const runtimeRef = useRef<RecorderRuntime>(createRecorderRuntime());
  const timersRef = useRef<VoiceRecorderTimers>(new VoiceRecorderTimers());
  const boundedMaxDurationSec = boundedVoiceDurationSec(maxDurationSec);
  const boundedMaxUploadMb = boundedVoiceUploadMb(maxUploadMb);

  const setRecorderPhase = useCallback((next: VoiceRecorderPhase) => {
    const runtime = runtimeRef.current;
    runtime.phase = next;
    if (runtime.mounted) setPhase(next);
  }, []);

  const stopRecording = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (runtime.stopPending) return;
    if (runtime.startPending && runtime.phase !== 'recording') {
      runtime.stopAfterStart = true;
      return;
    }
    if (runtime.phase !== 'recording') return;

    runtime.stopPending = true;
    timersRef.current.clear();
    const durationMs = Math.max(0, Date.now() - runtime.startedAt);
    try {
      await recorder.stop();
      void restorePlaybackAudioMode();
      if (runtime.discardRequested) return;

      const stopError = recordingStopError({
        durationMs,
        maxReached: runtime.maxReached,
        analysis: runtime.analysis,
      });
      if (stopError) {
        onError(stopError);
        return;
      }

      const uri = recorder.uri || recorder.getStatus().url;
      if (!uri) {
        onError('failed');
        return;
      }
      const encoded = await encodeRecordingFile(uri, boundedMaxUploadMb);
      if (!encoded.ok) {
        onError(encoded.error);
        return;
      }

      setRecorderPhase('transcribing');
      const transcript = await onTranscribeAudio?.(encoded.dataUrl, { durationMs });
      if (transcript?.trim()) onTranscript(transcript.trim());
      else onError('noInput');
    } catch (error) {
      void restorePlaybackAudioMode();
      onError(voiceErrorFromUnknown(error));
    } finally {
      runtime.stopPending = false;
      runtime.stopAfterStart = false;
      runtime.discardRequested = false;
      setRecorderPhase('idle');
    }
  }, [
    boundedMaxUploadMb,
    onError,
    onTranscript,
    onTranscribeAudio,
    recorder,
    setRecorderPhase,
  ]);

  const discardRecording = useCallback(async () => {
    const runtime = runtimeRef.current;
    runtime.discardRequested = true;
    runtime.stopAfterStart = false;
    timersRef.current.clear();
    if (runtime.startPending && runtime.phase !== 'recording') {
      runtime.discardAfterStart = true;
      return;
    }
    if (runtime.phase !== 'recording' || runtime.stopPending) return;

    runtime.stopPending = true;
    try {
      await recorder.stop();
    } catch {
      // The native recorder can already be stopped while the app is backgrounding.
    } finally {
      void restorePlaybackAudioMode();
      runtime.stopPending = false;
      runtime.discardAfterStart = false;
      runtime.discardRequested = false;
      setRecorderPhase('idle');
    }
  }, [recorder, setRecorderPhase]);

  const startRecording = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (
      disabled
      || !onTranscribeAudio
      || runtime.phase !== 'idle'
      || runtime.startPending
    ) return;

    runtime.startPending = true;
    runtime.stopAfterStart = false;
    runtime.discardAfterStart = false;
    runtime.discardRequested = false;
    onClearError();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError('permission');
        return;
      }
      await enableRecordingAudioMode();
      await recorder.prepareToRecordAsync();
      runtime.startedAt = Date.now();
      runtime.maxReached = false;
      resetRecordingAnalysis(runtime.analysis);
      recorder.record();
      setRecorderPhase('recording');
      timersRef.current.start({
        maxDurationMs: boundedMaxDurationSec * 1000,
        noInputHintMs: NO_INPUT_HINT_MS,
        onMaxDuration: () => {
          runtime.maxReached = true;
          void stopRecording();
        },
        onNoInputHint: () => {
          if (
            runtime.phase === 'recording'
            && shouldShowNoInputHint(runtime.analysis)
          ) {
            onError('noInput');
          }
        },
      });
    } catch (error) {
      timersRef.current.clear();
      void restorePlaybackAudioMode();
      setRecorderPhase('idle');
      onError(voiceErrorFromUnknown(error));
    } finally {
      runtime.startPending = false;
      if (runtime.discardAfterStart) void discardRecording();
      else if (runtime.stopAfterStart) void stopRecording();
    }
  }, [
    boundedMaxDurationSec,
    disabled,
    discardRecording,
    onClearError,
    onError,
    onTranscribeAudio,
    recorder,
    setRecorderPhase,
    stopRecording,
  ]);

  useEffect(() => {
    if (phase !== 'recording' || typeof recorderState.metering !== 'number') return;
    if (observeRecordingLevel(runtimeRef.current.analysis, recorderState.metering)) {
      onClearError();
    }
  }, [onClearError, phase, recorderState.metering]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') void discardRecording();
    });
    return () => subscription.remove();
  }, [discardRecording]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const timers = timersRef.current;
    runtime.mounted = true;
    return () => {
      runtime.mounted = false;
      timers.clear();
      void discardRecording();
    };
  }, [discardRecording]);

  const currentPhase = useCallback(() => runtimeRef.current.phase, []);

  return {
    phase,
    durationMillis: recorderState.durationMillis,
    metering: recorderState.metering,
    currentPhase,
    startRecording: () => { void startRecording(); },
    stopRecording: () => { void stopRecording(); },
  };
}
