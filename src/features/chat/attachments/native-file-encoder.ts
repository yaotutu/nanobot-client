import { File } from 'expo-file-system';

import { decodedBase64Bytes } from './attachment-encoder';

export async function encodeNativeFile(
  uri: string,
  mime: string,
): Promise<{ dataUrl: string; bytes: number }> {
  const file = new File(uri);
  const base64 = await file.base64();
  return {
    dataUrl: `data:${mime};base64,${base64}`,
    bytes: file.size || decodedBase64Bytes(base64),
  };
}
