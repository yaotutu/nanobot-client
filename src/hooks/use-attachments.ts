import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef, useState } from 'react';

import i18n from '@/i18n';
import type {
  ComposerAttachment,
  OutboundMedia,
  SendAttachment,
  WebUIIngressLimits,
} from '@/types/api';

const DEFAULT_MAX_COUNT = 4;
const DEFAULT_MAX_FILE_BYTES = 6 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const DEFAULT_MAX_FRAME_BYTES = 36 * 1024 * 1024;
const DEFAULT_ENVELOPE_RESERVE_BYTES = 64 * 1024;
const DEFAULT_MAX_TEXT_BYTES = 64 * 1024;
const NORMALIZE_MAX_EDGE = 2048;

const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

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

const PICKER_DOCUMENT_MIMES = [...new Set(DOCUMENT_MIME_BY_EXTENSION.values())];

interface PickedAsset {
  uri: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  kind: 'image' | 'file';
  width?: number;
  height?: number;
}

function attachmentId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function positiveLimit(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

function canonicalDocumentMime(name: string, declared?: string | null): string | null {
  const byExtension = DOCUMENT_MIME_BY_EXTENSION.get(extensionOf(name));
  if (byExtension) return byExtension;
  const normalized = declared?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized && DOCUMENT_MIMES.has(normalized) ? normalized : null;
}

function sniffImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) return 'image/gif';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

function decodedBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function projectedDataUrlBytes(mime: string, decodedBytes: number): number {
  return `data:${mime};base64,`.length + 4 * Math.ceil(decodedBytes / 3);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(code: string, limits: RequiredLimits): string {
  switch (code) {
    case 'unsupported_type':
      return i18n.t('thread.composer.imageRejected.unsupported_type');
    case 'empty_file':
      return i18n.t('thread.composer.imageRejected.empty_file');
    case 'too_many_attachments':
      return i18n.t('thread.composer.imageRejected.too_many_attachments', { max: limits.maxCount });
    case 'too_large':
      return i18n.t('thread.composer.attachmentTooLarge', {
        defaultValue: 'Each attachment must be smaller than {{max}}',
        max: formatBytes(limits.maxFileBytes),
      });
    case 'total_too_large':
      return i18n.t('thread.composer.attachmentsTotalTooLarge', {
        defaultValue: 'Attachments must be smaller than {{max}} in total',
        max: formatBytes(limits.maxTotalBytes),
      });
    case 'transport_too_large':
      return i18n.t('thread.composer.imageRejected.transport_too_large');
    case 'magic_mismatch':
      return i18n.t('thread.composer.imageRejected.magic_mismatch');
    case 'decode_failed':
      return i18n.t('thread.composer.imageRejected.decode_failed');
    default:
      return i18n.t('thread.composer.imageRejected.io');
  }
}

interface RequiredLimits {
  maxCount: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFrameBytes: number;
  envelopeReserveBytes: number;
  maxTextBytes: number;
}

function ingressLimits(limits?: WebUIIngressLimits): RequiredLimits {
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

async function encodeNativeFile(uri: string, mime: string): Promise<{ dataUrl: string; bytes: number }> {
  const file = new File(uri);
  const base64 = await file.base64();
  return { dataUrl: `data:${mime};base64,${base64}`, bytes: file.size || decodedBase64Bytes(base64) };
}

async function encodeImage(asset: PickedAsset, limits: RequiredLimits): Promise<{
  dataUrl: string;
  bytes: number;
  mime: string;
  uri: string;
}> {
  const source = new File(asset.uri);
  const declared = asset.mime?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const shouldNormalize =
    !IMAGE_MIMES.has(declared) ||
    (asset.size ?? source.size) > limits.maxFileBytes;

  if (!shouldNormalize) {
    const bytes = await source.bytes();
    const sniffed = sniffImageMime(bytes.subarray(0, 12));
    if (!sniffed) throw new Error('magic_mismatch');
    const base64 = await source.base64();
    const decodedBytes = source.size || decodedBase64Bytes(base64);
    if (decodedBytes > limits.maxFileBytes) throw new Error('too_large');
    return {
      dataUrl: `data:${sniffed};base64,${base64}`,
      bytes: decodedBytes,
      mime: sniffed,
      uri: asset.uri,
    };
  }

  let context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  let width = asset.width ?? 0;
  let height = asset.height ?? 0;
  if (!width || !height) {
    const decoded = await context.renderAsync();
    width = decoded.width;
    height = decoded.height;
    context = ImageManipulator.ImageManipulator.manipulate(decoded);
  }
  const longest = Math.max(width, height);
  if (longest > NORMALIZE_MAX_EDGE) {
    if (width >= height) context.resize({ width: NORMALIZE_MAX_EDGE, height: null });
    else context.resize({ width: null, height: NORMALIZE_MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: true,
    compress: 0.85,
    format: declared === 'image/png' || declared === 'image/gif'
      ? ImageManipulator.SaveFormat.PNG
      : ImageManipulator.SaveFormat.WEBP,
  });
  const base64 = result.base64;
  if (!base64) throw new Error('decode_failed');
  const mime = result.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/webp';
  const bytes = new File(result.uri).size || decodedBase64Bytes(base64);
  if (bytes > limits.maxFileBytes) throw new Error('too_large');
  return { dataUrl: `data:${mime};base64,${base64}`, bytes, mime, uri: result.uri };
}

export function useAttachments(limits?: WebUIIngressLimits) {
  const resolvedLimits = ingressLimits(limits);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const attachmentsRef = useRef(attachments);
  const replaceAttachment = useCallback((id: string, patch: Partial<ComposerAttachment>) => {
    setAttachments((current) => {
      const next = current.map((item) => item.id === id ? { ...item, ...patch } : item);
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  const enqueue = useCallback(async (assets: PickedAsset[]) => {
    setError(null);
    let current = attachmentsRef.current;
    const slots = Math.max(0, resolvedLimits.maxCount - current.length);
    if (slots === 0) {
      setError(errorMessage('too_many_attachments', resolvedLimits));
      return;
    }
    const accepted = assets.slice(0, slots);
    if (assets.length > slots) setError(errorMessage('too_many_attachments', resolvedLimits));

    for (const asset of accepted) {
      const knownSize = asset.size ?? new File(asset.uri).size;
      const mime = asset.kind === 'image'
        ? asset.mime?.split(';', 1)[0]?.trim().toLowerCase() || 'image/jpeg'
        : canonicalDocumentMime(asset.name, asset.mime);
      if (!mime || (asset.kind === 'file' && !DOCUMENT_MIMES.has(mime))) {
        setError(errorMessage('unsupported_type', resolvedLimits));
        continue;
      }
      if (knownSize <= 0) {
        setError(errorMessage('empty_file', resolvedLimits));
        continue;
      }
      if (asset.kind === 'file' && knownSize > resolvedLimits.maxFileBytes) {
        setError(errorMessage('too_large', resolvedLimits));
        continue;
      }

      const projectedDecoded = current.reduce((sum, item) => sum + (item.encodedBytes ?? item.size), 0)
        + Math.min(knownSize, resolvedLimits.maxFileBytes);
      if (projectedDecoded > resolvedLimits.maxTotalBytes) {
        setError(errorMessage('total_too_large', resolvedLimits));
        continue;
      }
      const projectedWire = current.reduce(
        (sum, item) => sum + (item.dataUrl?.length ?? projectedDataUrlBytes(item.mime, item.size)),
        0,
      ) + projectedDataUrlBytes(mime, Math.min(knownSize, resolvedLimits.maxFileBytes));
      const payloadBudget = Math.max(
        0,
        resolvedLimits.maxFrameBytes - resolvedLimits.envelopeReserveBytes - resolvedLimits.maxTextBytes,
      );
      if (projectedWire > payloadBudget) {
        setError(errorMessage('transport_too_large', resolvedLimits));
        continue;
      }

      const id = attachmentId();
      const pending: ComposerAttachment = {
        id,
        kind: asset.kind,
        name: asset.name,
        uri: asset.uri,
        mime,
        size: knownSize,
        status: 'encoding',
      };
      current = [...current, pending];
      attachmentsRef.current = current;
      setAttachments(current);

      try {
        const encoded = asset.kind === 'image'
          ? await encodeImage(asset, resolvedLimits)
          : { ...(await encodeNativeFile(asset.uri, mime)), mime, uri: asset.uri };
        const otherDecoded = attachmentsRef.current
          .filter((item) => item.id !== id)
          .reduce((sum, item) => sum + (item.encodedBytes ?? item.size), 0);
        if (otherDecoded + encoded.bytes > resolvedLimits.maxTotalBytes) {
          throw new Error('total_too_large');
        }
        replaceAttachment(id, {
          status: 'ready',
          dataUrl: encoded.dataUrl,
          encodedBytes: encoded.bytes,
          mime: encoded.mime,
          uri: encoded.uri,
        });
      } catch (caught) {
        const code = caught instanceof Error ? caught.message : 'io';
        replaceAttachment(id, { status: 'error', error: errorMessage(code, resolvedLimits) });
      }
    }
  }, [replaceAttachment, resolvedLimits]);

  const pickImages = useCallback(async () => {
    const remaining = resolvedLimits.maxCount - attachmentsRef.current.length;
    if (remaining <= 0) {
      setError(errorMessage('too_many_attachments', resolvedLimits));
      return;
    }
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
        quality: 1,
      });
      if (result.canceled) return;
      await enqueue(result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName || `image-${Date.now()}.jpg`,
        mime: asset.mimeType,
        size: asset.fileSize,
        kind: 'image' as const,
        width: asset.width,
        height: asset.height,
      })));
    } catch {
      setError(i18n.t('thread.composer.photoPickerFailed', {
        defaultValue: 'Could not open the photo picker. Try again.',
      }));
    }
  }, [enqueue, resolvedLimits]);

  const pickDocuments = useCallback(async () => {
    const remaining = resolvedLimits.maxCount - attachmentsRef.current.length;
    if (remaining <= 0) {
      setError(errorMessage('too_many_attachments', resolvedLimits));
      return;
    }
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: PICKER_DOCUMENT_MIMES,
      });
      if (result.canceled) return;
      await enqueue(result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mime: asset.mimeType,
        size: asset.size,
        kind: 'file' as const,
      })));
    } catch {
      setError(i18n.t('thread.composer.filePickerFailed', {
        defaultValue: 'Could not open the file picker. Try again.',
      }));
    }
  }, [enqueue, resolvedLimits]);

  const remove = useCallback((id: string) => {
    setAttachments((current) => {
      const next = current.filter((item) => item.id !== id);
      attachmentsRef.current = next;
      return next;
    });
    setError(null);
  }, []);

  const clear = useCallback(() => {
    attachmentsRef.current = [];
    setAttachments([]);
    setError(null);
  }, []);

  const readyAttachments: SendAttachment[] = attachments
    .filter((item): item is ComposerAttachment & { dataUrl: string } => (
      item.status === 'ready' && typeof item.dataUrl === 'string'
    ))
    .map((item) => ({
      media: { data_url: item.dataUrl, name: item.name } satisfies OutboundMedia,
      preview: { kind: item.kind, url: item.uri, name: item.name },
    }));

  return {
    attachments,
    readyAttachments,
    encoding: attachments.some((item) => item.status === 'encoding'),
    hasErrors: attachments.some((item) => item.status === 'error'),
    full: attachments.length >= resolvedLimits.maxCount,
    error,
    clearError: () => setError(null),
    pickImages,
    pickDocuments,
    remove,
    clear,
  };
}
