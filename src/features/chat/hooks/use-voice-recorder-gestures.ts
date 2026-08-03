import { useCallback, useRef } from 'react';

import type { VoiceRecorderPhase } from '@/features/chat/voice/types';

interface VoiceRecorderGestureOptions {
  disabled: boolean;
  currentPhase: () => VoiceRecorderPhase;
  startRecording: () => void;
  stopRecording: () => void;
}

export function useVoiceRecorderGestures({
  disabled,
  currentPhase,
  startRecording,
  stopRecording,
}: VoiceRecorderGestureOptions) {
  const holdActiveRef = useRef(false);
  const suppressNextPressRef = useRef(false);

  const onPress = useCallback(() => {
    if (suppressNextPressRef.current) {
      suppressNextPressRef.current = false;
      return;
    }
    const phase = currentPhase();
    if (phase === 'recording') stopRecording();
    else if (phase === 'idle') startRecording();
  }, [currentPhase, startRecording, stopRecording]);

  const onLongPress = useCallback(() => {
    if (disabled || currentPhase() !== 'idle') return;
    holdActiveRef.current = true;
    suppressNextPressRef.current = true;
    startRecording();
  }, [currentPhase, disabled, startRecording]);

  const onPressOut = useCallback(() => {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    stopRecording();
  }, [stopRecording]);

  return { onPress, onLongPress, onPressOut };
}
