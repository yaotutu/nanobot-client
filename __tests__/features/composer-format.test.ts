import { describe, expect, it } from 'vitest';

import { formatAttachmentBytes } from '@/features/chat/composer/model/presentation';

describe('formatAttachmentBytes', () => {
  it('formats bytes, kilobytes, and megabytes at stable boundaries', () => {
    expect(formatAttachmentBytes(512)).toBe('512 B');
    expect(formatAttachmentBytes(1024)).toBe('1.0 KB');
    expect(formatAttachmentBytes(1024 * 1024)).toBe('1.0 MB');
  });
});
