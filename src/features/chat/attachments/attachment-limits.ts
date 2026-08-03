import type { WebUIIngressLimits } from '@/types/api/runtime';

const DEFAULT_MAX_COUNT = 4;
const DEFAULT_MAX_FILE_BYTES = 6 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const DEFAULT_MAX_FRAME_BYTES = 36 * 1024 * 1024;
const DEFAULT_ENVELOPE_RESERVE_BYTES = 64 * 1024;
const DEFAULT_MAX_TEXT_BYTES = 64 * 1024;

export interface AttachmentLimits {
  maxCount: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFrameBytes: number;
  envelopeReserveBytes: number;
  maxTextBytes: number;
}

export function positiveLimit(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

export function ingressLimits(limits?: WebUIIngressLimits): AttachmentLimits {
  return {
    maxCount: positiveLimit(limits?.attachments.max_count, DEFAULT_MAX_COUNT),
    maxFileBytes: positiveLimit(limits?.attachments.max_file_bytes, DEFAULT_MAX_FILE_BYTES),
    maxTotalBytes: positiveLimit(limits?.attachments.max_total_bytes, DEFAULT_MAX_TOTAL_BYTES),
    maxFrameBytes: positiveLimit(limits?.transport.max_frame_bytes, DEFAULT_MAX_FRAME_BYTES),
    envelopeReserveBytes: positiveLimit(
      limits?.transport.envelope_reserve_bytes,
      DEFAULT_ENVELOPE_RESERVE_BYTES,
    ),
    maxTextBytes: positiveLimit(limits?.message.max_text_bytes, DEFAULT_MAX_TEXT_BYTES),
  };
}

export function attachmentPayloadBudget(limits: AttachmentLimits): number {
  return Math.max(0, limits.maxFrameBytes - limits.envelopeReserveBytes - limits.maxTextBytes);
}
