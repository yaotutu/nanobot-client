import { describe, expect, it } from 'vitest';

import { uniqueMediaAttachments } from '@/features/chat/components/widgets/message-media-model';

describe('uniqueMediaAttachments', () => {
  it('deduplicates attachments by kind, URL, and name while preserving order', () => {
    expect(uniqueMediaAttachments([
      { kind: 'image', url: 'https://example.test/a.png', name: 'a' },
      { kind: 'image', url: 'https://example.test/a.png', name: 'a' },
      { kind: 'file', url: 'https://example.test/a.png', name: 'a' },
    ])).toEqual([
      { kind: 'image', url: 'https://example.test/a.png', name: 'a' },
      { kind: 'file', url: 'https://example.test/a.png', name: 'a' },
    ]);
  });

  it('drops empty attachment placeholders', () => {
    expect(uniqueMediaAttachments([
      { kind: 'file' },
      { kind: 'video', name: 'clip.mp4' },
    ])).toEqual([{ kind: 'video', name: 'clip.mp4' }]);
  });
});
