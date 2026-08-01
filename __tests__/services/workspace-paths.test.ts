import { describe, expect, it } from 'vitest';

import { normalizeWorkspaceScope, projectNameFromPath, sameWorkspacePath } from '@/services/workspace-paths';

describe('projectNameFromPath', () => {
  it('takes the last segment of a unix path', () => {
    expect(projectNameFromPath('/Users/foo/projects/my-app')).toBe('my-app');
  });

  it('handles paths without slashes', () => {
    expect(projectNameFromPath('my-app')).toBe('my-app');
  });
});

describe('sameWorkspacePath', () => {
  it('treats trailing slash differences as equal', () => {
    expect(sameWorkspacePath('/a/b', '/a/b/')).toBe(true);
  });

  it('returns false for distinct paths', () => {
    expect(sameWorkspacePath('/a/b', '/a/c')).toBe(false);
  });

  it('returns false when either is empty/null', () => {
    expect(sameWorkspacePath(null, null)).toBe(false);
  });
});

describe('normalizeWorkspaceScope', () => {
  it('defaults restrict_to_workspace based on access_mode', () => {
    const restricted = normalizeWorkspaceScope({ project_path: '/p', access_mode: 'restricted' });
    expect(restricted.restrict_to_workspace).toBe(true);
    const full = normalizeWorkspaceScope({ project_path: '/p', access_mode: 'full' });
    expect(full.restrict_to_workspace).toBe(false);
  });

  it('defaults to false for access_mode full', () => {
    const out = normalizeWorkspaceScope({
      project_path: '/p',
      access_mode: 'full',
      restrict_to_workspace: true,
    });
    expect(out.restrict_to_workspace).toBe(false); // access_mode=full forces false
  });
});
