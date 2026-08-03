import { describe, expect, it } from 'vitest';

import { validateAttachmentCandidate } from '@/features/chat/attachments/attachment-validation';
import type { AttachmentLimits } from '@/features/chat/attachments/attachment-limits';
import type { PickedAsset } from '@/features/chat/attachments/types';
import type { ComposerAttachment } from '@/types/api/chat';

const baseLimits: AttachmentLimits = {
  maxCount: 4,
  maxFileBytes: 100,
  maxTotalBytes: 400,
  maxFrameBytes: 2_000,
  envelopeReserveBytes: 100,
  maxTextBytes: 100,
};

const fileAsset: PickedAsset = {
  uri: 'file:///document.txt',
  name: 'document.txt',
  mime: 'text/plain',
  kind: 'file',
};

function validate(options: Partial<{
  asset: PickedAsset;
  current: ComposerAttachment[];
  knownSize: number;
  limits: AttachmentLimits;
  mime: string | null;
}> = {}) {
  return validateAttachmentCandidate({
    asset: options.asset ?? fileAsset,
    current: options.current ?? [],
    knownSize: options.knownSize ?? 10,
    limits: options.limits ?? baseLimits,
    mime: options.mime === undefined ? 'text/plain' : options.mime,
  });
}

describe('attachment validation', () => {
  it('rejects unsupported, empty, and oversized document files', () => {
    expect(validate({ mime: null })).toBe('unsupported_type');
    expect(validate({ knownSize: 0 })).toBe('empty_file');
    expect(validate({ knownSize: 101 })).toBe('too_large');
  });

  it('rejects decoded totals and transport payloads over budget', () => {
    const current: ComposerAttachment[] = [{
      id: 'existing',
      kind: 'file',
      name: 'existing.txt',
      uri: 'file:///existing.txt',
      mime: 'text/plain',
      size: 10,
      encodedBytes: 10,
      status: 'ready',
    }];
    expect(validate({
      current,
      knownSize: 10,
      limits: { ...baseLimits, maxTotalBytes: 15 },
    })).toBe('total_too_large');
    expect(validate({
      knownSize: 10,
      limits: {
        ...baseLimits,
        maxFrameBytes: 120,
        envelopeReserveBytes: 60,
        maxTextBytes: 50,
      },
    })).toBe('transport_too_large');
  });

  it('allows oversized images to continue to normalization', () => {
    expect(validate({
      asset: {
        uri: 'file:///photo.jpg',
        name: 'photo.jpg',
        mime: 'image/jpeg',
        kind: 'image',
      },
      knownSize: 200,
      mime: 'image/jpeg',
      limits: {
        ...baseLimits,
        maxTotalBytes: 500,
        maxFrameBytes: 2_000,
      },
    })).toBeNull();
  });
});
