import { describe, expect, it } from 'vitest';

import {
  createQueuedPrompt,
  removeQueuedPrompt,
} from '@/features/chat/composer/model/queue';
import type { SendAttachment } from '@/types/api/chat';

const attachment: SendAttachment = {
  media: { data_url: 'data:image/png;base64,abc', name: 'image.png' },
  preview: { kind: 'image', name: 'image.png', url: 'file:///image.png' },
};

describe('composer queue model', () => {
  it('creates deterministic ids and owns the attachments array', () => {
    const attachments = [attachment];
    const prompt = createQueuedPrompt({
      text: 'Explain this image',
      attachments,
      options: { quotedContext: 'Earlier answer' },
    }, 3, 12_345);

    expect(prompt).toEqual({
      id: 'queued-prompt-12345-3',
      text: 'Explain this image',
      attachments: [attachment],
      options: { quotedContext: 'Earlier answer' },
    });
    expect(prompt.attachments).not.toBe(attachments);
  });

  it('preserves an explicit id', () => {
    expect(createQueuedPrompt({
      id: 'restored-prompt',
      text: 'Continue',
      attachments: [],
    }, 1, 100).id).toBe('restored-prompt');
  });

  it('removes only the selected prompt without reordering the rest', () => {
    const prompts = [
      createQueuedPrompt({ text: 'First', attachments: [] }, 1, 100),
      createQueuedPrompt({ text: 'Second', attachments: [] }, 2, 100),
      createQueuedPrompt({ text: 'Third', attachments: [] }, 3, 100),
    ];

    expect(removeQueuedPrompt(prompts, 'queued-prompt-100-2').map((prompt) => prompt.text))
      .toEqual(['First', 'Third']);
    expect(prompts).toHaveLength(3);
  });
});
