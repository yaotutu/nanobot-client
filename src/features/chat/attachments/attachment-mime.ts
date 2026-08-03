const DOCUMENT_MIME_BY_EXTENSION = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.csv', 'text/csv'],
  ['.json', 'application/json'],
  ['.xml', 'application/xml'],
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.log', 'text/plain'],
  ['.yaml', 'application/yaml'],
  ['.yml', 'application/yaml'],
  ['.toml', 'application/toml'],
  ['.ini', 'text/plain'],
  ['.cfg', 'text/plain'],
]);

const DOCUMENT_MIMES = new Set([
  ...DOCUMENT_MIME_BY_EXTENSION.values(),
  'application/x-yaml',
  'application/xhtml+xml',
  'text/xml',
  'text/yaml',
]);

export const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export const PICKER_DOCUMENT_MIMES = [...new Set(DOCUMENT_MIME_BY_EXTENSION.values())];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

export function canonicalDocumentMime(name: string, declared?: string | null): string | null {
  const byExtension = DOCUMENT_MIME_BY_EXTENSION.get(extensionOf(name));
  if (byExtension) return byExtension;
  const normalized = declared?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized && DOCUMENT_MIMES.has(normalized) ? normalized : null;
}

export function sniffImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 6
    && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
    && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) return 'image/gif';
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}
