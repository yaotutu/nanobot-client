import i18n from '@/i18n';
import type { ComposerAttachment } from '@/types/api/chat';

import { projectedDataUrlBytes } from './attachment-encoder';
import {
  attachmentPayloadBudget,
  type AttachmentLimits,
} from './attachment-limits';
import { canonicalDocumentMime } from './attachment-mime';
import type { PickedAsset } from './types';

export type AttachmentValidationError =
  | 'unsupported_type'
  | 'empty_file'
  | 'too_many_attachments'
  | 'too_large'
  | 'total_too_large'
  | 'transport_too_large'
  | 'magic_mismatch'
  | 'decode_failed'
  | 'io';

export function attachmentId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentErrorMessage(
  code: string,
  limits: AttachmentLimits,
): string {
  switch (code) {
    case 'unsupported_type':
      return i18n.t('thread.composer.imageRejected.unsupported_type');
    case 'empty_file':
      return i18n.t('thread.composer.imageRejected.empty_file');
    case 'too_many_attachments':
      return i18n.t('thread.composer.imageRejected.too_many_attachments', {
        max: limits.maxCount,
      });
    case 'too_large':
      return i18n.t('thread.composer.attachmentTooLarge', {
        defaultValue: 'Each attachment must be smaller than {{max}}',
        max: formatBytes(limits.maxFileBytes),
      });
    case 'total_too_large':
      return i18n.t('thread.composer.attachmentsTotalTooLarge', {
        defaultValue: 'Attachments must be smaller than {{max}} in total',
        max: formatBytes(limits.maxTotalBytes),
      });
    case 'transport_too_large':
      return i18n.t('thread.composer.imageRejected.transport_too_large');
    case 'magic_mismatch':
      return i18n.t('thread.composer.imageRejected.magic_mismatch');
    case 'decode_failed':
      return i18n.t('thread.composer.imageRejected.decode_failed');
    default:
      return i18n.t('thread.composer.imageRejected.io');
  }
}

export function resolvedAttachmentMime(asset: PickedAsset): string | null {
  return asset.kind === 'image'
    ? asset.mime?.split(';', 1)[0]?.trim().toLowerCase() || 'image/jpeg'
    : canonicalDocumentMime(asset.name, asset.mime);
}

export function validateAttachmentCandidate(options: {
  asset: PickedAsset;
  current: ComposerAttachment[];
  knownSize: number;
  limits: AttachmentLimits;
  mime: string | null;
}): AttachmentValidationError | null {
  const { asset, current, knownSize, limits, mime } = options;
  if (!mime) return 'unsupported_type';
  if (knownSize <= 0) return 'empty_file';
  if (asset.kind === 'file' && knownSize > limits.maxFileBytes) {
    return 'too_large';
  }

  const projectedDecoded = current.reduce(
    (sum, item) => sum + (item.encodedBytes ?? item.size),
    0,
  ) + Math.min(knownSize, limits.maxFileBytes);
  if (projectedDecoded > limits.maxTotalBytes) return 'total_too_large';

  const projectedWire = current.reduce(
    (sum, item) =>
      sum + (item.dataUrl?.length ?? projectedDataUrlBytes(item.mime, item.size)),
    0,
  ) + projectedDataUrlBytes(mime, Math.min(knownSize, limits.maxFileBytes));
  if (projectedWire > attachmentPayloadBudget(limits)) {
    return 'transport_too_large';
  }
  return null;
}
