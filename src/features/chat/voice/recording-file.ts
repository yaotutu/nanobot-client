import { File } from 'expo-file-system';

export type RecordingFileResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: 'tooLong' };

export async function encodeRecordingFile(
  uri: string,
  maxUploadMb: number,
): Promise<RecordingFileResult> {
  const file = new File(uri);
  const byteSize = file.size;
  if (
    Number.isFinite(byteSize)
    && byteSize > maxUploadMb * 1024 * 1024
  ) {
    return { ok: false, error: 'tooLong' };
  }
  const base64 = await file.base64();
  return {
    ok: true,
    dataUrl: `data:audio/m4a;base64,${base64}`,
  };
}
