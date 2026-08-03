import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  boundedVoiceDurationSec,
  boundedVoiceUploadMb,
  DEFAULT_MAX_DURATION_SEC,
  DEFAULT_MAX_UPLOAD_MB,
  METERING_SILENCE_DB,
  MIN_RECORDING_MS,
  NO_INPUT_HINT_MS,
  voiceErrorFromUnknown,
  waveformFromMetering,
  WAVEFORM_BARS,
  type VoiceRecorderError,
} from '@/features/chat/voice/voice-recorder-policy';

export type { VoiceRecorderError } from '@/features/chat/voice/voice-recorder-policy';

export type VoiceRecorderPhase = 'idle' | 'recording' | 'transcribing';
interface UseVoiceRecorderOptions {
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

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export function useVoiceRecorder({
  disabled = false,
  maxDurationSec = DEFAULT_MAX_DURATION_SEC,
  maxUploadMb = DEFAULT_MAX_UPLOAD_MB,
  onError,
  onClearError,
  onTranscript,
  onTranscribeAudio,
}: UseVoiceRecorderOptions): VoiceRecorderController {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 80);
  const [phase, setPhase] = useState<VoiceRecorderPhase>('idle');
  const mountedRef = useRef(true);
  const phaseRef = useRef<VoiceRecorderPhase>('idle');
  const startedAtRef = useRef(0);
  const startPendingRef = useRef(false);
  const stopPendingRef = useRef(false);
  const stopAfterStartRef = useRef(false);
  const discardAfterStartRef = useRef(false);
  const discardRequestedRef = useRef(false);
  const holdActiveRef = useRef(false);
  const suppressNextPressRef = useRef(false);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxReachedRef = useRef(false);
  const levelObservedRef = useRef(false);
  const peakDbRef = useRef(Number.NEGATIVE_INFINITY);
  const noInputHintVisibleRef = useRef(false);

  const boundedMaxDurationSec = boundedVoiceDurationSec(maxDurationSec);
  const boundedMaxUploadMb = boundedVoiceUploadMb(maxUploadMb);

  const setRecorderPhase = useCallback((next: VoiceRecorderPhase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    maxTimerRef.current = null;
    hintTimerRef.current = null;
  }, []);

  const restoreAudioMode = useCallback(() => {
    void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
  }, []);

  const stopRecording = useCallback(async () => {
    if (stopPendingRef.current) return;
    if (startPendingRef.current && phaseRef.current !== 'recording') {
      stopAfterStartRef.current = true;
      return;
    }
    if (phaseRef.current !== 'recording') return;
    stopPendingRef.current = true;
    clearTimers();
    const durationMs = Math.max(0, Date.now() - startedAtRef.current);
    try {
      await recorder.stop();
      restoreAudioMode();
      if (discardRequestedRef.current) {
        setRecorderPhase('idle');
        return;
      }
      const hasMeasuredSilence = levelObservedRef.current && peakDbRef.current < METERING_SILENCE_DB;
      if (maxReachedRef.current) {
        setRecorderPhase('idle');
        onError('tooLong');
        return;
      }
      if (durationMs < MIN_RECORDING_MS) {
        setRecorderPhase('idle');
        onError('tooShort');
        return;
      }
      if (hasMeasuredSilence) {
        setRecorderPhase('idle');
        onError('noInput');
        return;
      }
      const uri = recorder.uri || recorder.getStatus().url;
      if (!uri) {
        setRecorderPhase('idle');
        onError('failed');
        return;
      }
      const file = new File(uri);
      const byteSize = file.size;
      if (Number.isFinite(byteSize) && byteSize > boundedMaxUploadMb * 1024 * 1024) {
        setRecorderPhase('idle');
        onError('tooLong');
        return;
      }
      setRecorderPhase('transcribing');
      const base64 = await file.base64();
      const transcript = await onTranscribeAudio?.(
        `data:audio/m4a;base64,${base64}`,
        { durationMs },
      );
      if (transcript?.trim()) onTranscript(transcript.trim());
      else onError('noInput');
    } catch (error) {
      restoreAudioMode();
      onError(voiceErrorFromUnknown(error));
    } finally {
      stopPendingRef.current = false;
      stopAfterStartRef.current = false;
      discardRequestedRef.current = false;
      if (mountedRef.current) {
        setRecorderPhase('idle');
      }
    }
  }, [
    boundedMaxUploadMb,
    clearTimers,
    onError,
    onTranscript,
    onTranscribeAudio,
    recorder,
    restoreAudioMode,
    setRecorderPhase,
  ]);

  const discardRecording = useCallback(async () => {
    discardRequestedRef.current = true;
    stopAfterStartRef.current = false;
    holdActiveRef.current = false;
    clearTimers();
    if (startPendingRef.current && phaseRef.current !== 'recording') {
      discardAfterStartRef.current = true;
      return;
    }
    if (phaseRef.current !== 'recording' || stopPendingRef.current) return;
    stopPendingRef.current = true;
    try {
      await recorder.stop();
    } catch {
      // The native recorder can already be stopped while the app is backgrounding.
    } finally {
      restoreAudioMode();
      stopPendingRef.current = false;
      discardAfterStartRef.current = false;
      discardRequestedRef.current = false;
      setRecorderPhase('idle');
    }
  }, [clearTimers, recorder, restoreAudioMode, setRecorderPhase]);

  const startRecording = useCallback(async () => {
    if (disabled || !onTranscribeAudio || phaseRef.current !== 'idle' || startPendingRef.current) return;
    startPendingRef.current = true;
    stopAfterStartRef.current = false;
    discardAfterStartRef.current = false;
    discardRequestedRef.current = false;
    onClearError();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError('permission');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      startedAtRef.current = Date.now();
      maxReachedRef.current = false;
      levelObservedRef.current = false;
      peakDbRef.current = Number.NEGATIVE_INFINITY;
      noInputHintVisibleRef.current = false;
      recorder.record();
      setRecorderPhase('recording');
      maxTimerRef.current = setTimeout(() => {
        maxReachedRef.current = true;
        void stopRecording();
      }, boundedMaxDurationSec * 1000);
      hintTimerRef.current = setTimeout(() => {
        if (
          phaseRef.current === 'recording'
          && levelObservedRef.current
          && peakDbRef.current < METERING_SILENCE_DB
        ) {
          noInputHintVisibleRef.current = true;
          onError('noInput');
        }
      }, NO_INPUT_HINT_MS);
    } catch (error) {
      clearTimers();
      restoreAudioMode();
      setRecorderPhase('idle');
      onError(voiceErrorFromUnknown(error));
    } finally {
      startPendingRef.current = false;
      if (discardAfterStartRef.current) void discardRecording();
      else if (stopAfterStartRef.current) void stopRecording();
    }
  }, [
    boundedMaxDurationSec,
    clearTimers,
    disabled,
    onClearError,
    onError,
    onTranscribeAudio,
    recorder,
    discardRecording,
    restoreAudioMode,
    setRecorderPhase,
    stopRecording,
  ]);

  useEffect(() => {
    if (phase !== 'recording' || typeof recorderState.metering !== 'number') return;
    levelObservedRef.current = true;
    peakDbRef.current = Math.max(peakDbRef.current, recorderState.metering);
    if (noInputHintVisibleRef.current && recorderState.metering >= METERING_SILENCE_DB) {
      noInputHintVisibleRef.current = false;
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void discardRecording();
    };
  }, [discardRecording]);

  const onPress = useCallback(() => {
    if (suppressNextPressRef.current) {
      suppressNextPressRef.current = false;
      return;
    }
    if (phaseRef.current === 'recording') void stopRecording();
    else if (phaseRef.current === 'idle') void startRecording();
  }, [startRecording, stopRecording]);

  const onLongPress = useCallback(() => {
    if (disabled || phaseRef.current !== 'idle') return;
    holdActiveRef.current = true;
    suppressNextPressRef.current = true;
    void startRecording();
  }, [disabled, startRecording]);

  const onPressOut = useCallback(() => {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    if (phaseRef.current === 'recording' || startPendingRef.current) void stopRecording();
  }, [stopRecording]);

  return useMemo(() => ({
    phase,
    elapsedMs: phase === 'recording' ? recorderState.durationMillis : 0,
    waveform: phase === 'recording'
      ? waveformFromMetering(recorderState.metering, recorderState.durationMillis)
      : Array(WAVEFORM_BARS).fill(0.08),
    disabled: disabled || !onTranscribeAudio || phase === 'transcribing',
    onPress,
    onLongPress,
    onPressOut,
  }), [
    disabled,
    onLongPress,
    onPress,
    onPressOut,
    onTranscribeAudio,
    phase,
    recorderState.durationMillis,
    recorderState.metering,
  ]);
}
