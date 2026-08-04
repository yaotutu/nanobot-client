import { describe, expect, it } from 'vitest';

import { compactFilePreviewBreadcrumb } from '@/features/chat/components/modals/file-preview-model';

describe('compactFilePreviewBreadcrumb', () => {
  it('keeps a short absolute path rooted', () => {
    expect(compactFilePreviewBreadcrumb('/workspace/app.ts')).toEqual({
      prefix: '/',
      parts: ['workspace', 'app.ts'],
    });
  });

  it('keeps only the last three segments of a long path', () => {
    expect(compactFilePreviewBreadcrumb('/home/user/project/src/app.tsx')).toEqual({
      prefix: '…',
      parts: ['project', 'src', 'app.tsx'],
    });
  });

  it('normalizes Windows separators', () => {
    expect(compactFilePreviewBreadcrumb('src\\features\\chat\\index.ts')).toEqual({
      prefix: '…',
      parts: ['features', 'chat', 'index.ts'],
    });
  });
});
