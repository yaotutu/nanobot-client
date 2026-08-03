import { describe, expect, it } from 'vitest';

import { decodedBase64Bytes, projectedDataUrlBytes } from '@/features/chat/attachments/attachment-encoder';
import { attachmentPayloadBudget, ingressLimits, positiveLimit } from '@/features/chat/attachments/attachment-limits';
import { canonicalDocumentMime, sniffImageMime } from '@/features/chat/attachments/attachment-mime';

describe('attachment policy', () => {
  it('normalizes supported document MIME types by extension', () => {
    expect(canonicalDocumentMime('README.MD', 'application/octet-stream')).toBe('text/markdown');
    expect(canonicalDocumentMime('payload.unknown', 'application/json; charset=utf-8')).toBe('application/json');
    expect(canonicalDocumentMime('payload.bin', 'application/octet-stream')).toBeNull();
  });

  it('sniffs supported image signatures', () => {
    expect(sniffImageMime(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(sniffImageMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif');
    expect(sniffImageMime(Uint8Array.from([1, 2, 3]))).toBeNull();
  });

  it('calculates encoded sizes and safe ingress defaults', () => {
    expect(decodedBase64Bytes('YWJj')).toBe(3);
    expect(decodedBase64Bytes('YQ==')).toBe(1);
    expect(projectedDataUrlBytes('text/plain', 3)).toBe('data:text/plain;base64,'.length + 4);
    expect(positiveLimit(-1, 12)).toBe(12);
    const limits = ingressLimits();
    expect(attachmentPayloadBudget(limits)).toBe(
      limits.maxFrameBytes - limits.envelopeReserveBytes - limits.maxTextBytes,
    );
  });
});
