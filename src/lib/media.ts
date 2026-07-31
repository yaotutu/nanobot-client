import { DEFAULT_SERVER_URL } from '@/lib/config';
import type { UIMediaAttachment } from '@/types/nanobot';

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg', '.tif', '.tiff',
]);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv', '.3gp']);

function resolveMediaUrl(value?: string): string | undefined {
  if (!value) return value;
  if (value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  try {
    return new URL(value, `${DEFAULT_SERVER_URL}/`).toString();
  } catch {
    return value;
  }
}

function extensionOf(value?: string): string {
  if (!value) return '';
  const path = value.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot);
}

export function toMediaAttachment(media: {
  url?: string;
  name?: string;
  kind?: UIMediaAttachment['kind'];
}): UIMediaAttachment {
  const resolvedUrl = resolveMediaUrl(media.url);
  const url = resolvedUrl ?? '';
  const extension = extensionOf(media.name) || extensionOf(url);
  const kind = url.startsWith('data:image/') || IMAGE_EXTENSIONS.has(extension)
    ? 'image'
    : url.startsWith('data:video/') || VIDEO_EXTENSIONS.has(extension)
      ? 'video'
      : media.kind ?? 'file';
  return { kind, url: resolvedUrl, name: media.name };
}
