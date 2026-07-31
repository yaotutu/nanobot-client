export type FileReferenceKind =
  | 'default'
  | 'css'
  | 'html'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'notebook'
  | 'python'
  | 'react'
  | 'typescript';

export function isFilePatternReference(value: string): boolean {
  return /[*?[\]{}]/.test(value.trim());
}

export function isLikelyFilePath(value: string): boolean {
  const raw = value.trim();
  if (!raw || raw.includes('\n')) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return false;
  if (isFilePatternReference(raw)) return false;
  if (!/[\\/]/.test(raw) && !/^(dockerfile|makefile|readme|package-lock\.json)$/i.test(raw)) {
    return false;
  }
  const normalized = raw.replace(/\\/g, '/');
  const name = normalized.split('/').filter(Boolean).pop() ?? normalized;
  if (!name || name === '.' || name === '..') return false;
  if (/^(dockerfile|makefile|readme|package-lock\.json)$/i.test(name)) return true;
  return /\.[a-z0-9][a-z0-9_-]{0,12}$/i.test(name);
}

export function splitFilePath(path: string): { directory: string; name: string } {
  const normalized = path.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  if (slash < 0) return { directory: '', name: path };
  return {
    directory: normalized.slice(0, slash + 1),
    name: normalized.slice(slash + 1) || normalized,
  };
}

export function fileKindForPath(path: string): FileReferenceKind {
  const normalized = path.toLowerCase();
  const name = normalized.split(/[\\/]/).pop() ?? normalized;
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : '';
  switch (ext) {
    case 'py':
    case 'pyi':
      return 'python';
    case 'jsx':
    case 'tsx':
      return 'react';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
    case 'sass':
      return 'css';
    case 'json':
    case 'jsonl':
      return 'json';
    case 'md':
    case 'mdx':
      return 'markdown';
    case 'ipynb':
      return 'notebook';
    default:
      return 'default';
  }
}

export function cleanFileReferenceTarget(value: string): string {
  let target = value.trim();
  if (!target) return '';
  try {
    if (/^file:\/\//i.test(target)) {
      target = decodeURIComponent(target.replace(/^file:\/\//i, ''));
    } else {
      target = decodeURIComponent(target);
    }
  } catch {
    // Keep undecodable paths unchanged.
  }
  target = target.split('?', 1)[0]?.split('#', 1)[0]?.trim() ?? '';
  if (!/^[A-Za-z]:[\\/]/.test(target)) target = target.replace(/:\d+(?::\d+)?$/, '');
  return target;
}

export function isPreviewableFileTarget(value: string): boolean {
  if (isFilePatternReference(value)) return false;
  if (isLikelyFilePath(value)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (/[\\/]/.test(value)) return false;
  return /^[^?#]+\.[a-z0-9][a-z0-9_-]{0,12}$/i.test(value);
}

export function fileReferenceFromLink(href?: string): string | null {
  if (!href || /^https?:\/\//i.test(href) || href.startsWith('#')) return null;
  const target = cleanFileReferenceTarget(href);
  return isPreviewableFileTarget(target) ? target : null;
}

export function isNonNavigableFilePatternLink(href?: string): boolean {
  if (!href || /^https?:\/\//i.test(href) || href.startsWith('#')) return false;
  const target = cleanFileReferenceTarget(href);
  return Boolean(target && isFilePatternReference(target));
}
