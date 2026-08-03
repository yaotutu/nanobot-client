import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

import { decodedBase64Bytes } from './attachment-encoder';
import type { AttachmentLimits } from './attachment-limits';
import { IMAGE_MIMES, sniffImageMime } from './attachment-mime';
import type { EncodedAttachment, PickedAsset } from './types';

const NORMALIZE_MAX_EDGE = 2048;

export async function encodeImage(
  asset: PickedAsset,
  limits: AttachmentLimits,
): Promise<EncodedAttachment> {
  const source = new File(asset.uri);
  const declared = asset.mime?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const shouldNormalize =
    !IMAGE_MIMES.has(declared)
    || (asset.size ?? source.size) > limits.maxFileBytes;

  if (!shouldNormalize) {
    const bytes = await source.bytes();
    const sniffed = sniffImageMime(bytes.subarray(0, 12));
    if (!sniffed) throw new Error('magic_mismatch');
    const base64 = await source.base64();
    const decodedBytes = source.size || decodedBase64Bytes(base64);
    if (decodedBytes > limits.maxFileBytes) throw new Error('too_large');
    return {
      dataUrl: `data:${sniffed};base64,${base64}`,
      bytes: decodedBytes,
      mime: sniffed,
      uri: asset.uri,
    };
  }

  let context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  let width = asset.width ?? 0;
  let height = asset.height ?? 0;
  if (!width || !height) {
    const decoded = await context.renderAsync();
    width = decoded.width;
    height = decoded.height;
    context = ImageManipulator.ImageManipulator.manipulate(decoded);
  }
  const longest = Math.max(width, height);
  if (longest > NORMALIZE_MAX_EDGE) {
    if (width >= height) context.resize({ width: NORMALIZE_MAX_EDGE, height: null });
    else context.resize({ width: null, height: NORMALIZE_MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: true,
    compress: 0.85,
    format:
      declared === 'image/png' || declared === 'image/gif'
        ? ImageManipulator.SaveFormat.PNG
        : ImageManipulator.SaveFormat.WEBP,
  });
  const base64 = result.base64;
  if (!base64) throw new Error('decode_failed');
  const mime = result.uri.toLowerCase().endsWith('.png')
    ? 'image/png'
    : 'image/webp';
  const bytes = new File(result.uri).size || decodedBase64Bytes(base64);
  if (bytes > limits.maxFileBytes) throw new Error('too_large');
  return {
    dataUrl: `data:${mime};base64,${base64}`,
    bytes,
    mime,
    uri: result.uri,
  };
}
