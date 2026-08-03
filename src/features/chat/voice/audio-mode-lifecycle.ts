import { setAudioModeAsync } from 'expo-audio';

export async function enableRecordingAudioMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });
}

export function restorePlaybackAudioMode(): Promise<void> {
  return setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
}
