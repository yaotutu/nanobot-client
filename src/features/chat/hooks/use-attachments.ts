import { useCallback, useRef, useState } from 'react';

import {
  ingressLimits,
  type AttachmentLimits,
} from '@/features/chat/attachments/attachment-limits';
import { PICKER_DOCUMENT_MIMES } from '@/features/chat/attachments/attachment-mime';
import {
  attachmentErrorMessage,
  attachmentId,
  resolvedAttachmentMime,
  validateAttachmentCandidate,
} from '@/features/chat/attachments/attachment-validation';
import type { PickedAsset } from '@/features/chat/attachments/types';
import i18n from '@/i18n';
import type { ComposerAttachment } from '@/types/api/chat/attachments';
import type { OutboundMedia } from '@/types/api/chat/media';
import type { SendAttachment } from '@/types/api/chat/commands';
import type { WebUIIngressLimits } from '@/types/api/runtime';

/**
 * Picker 和编码器只在用户主动添加附件后加载，避免它们进入聊天首页的模块执行关键路径。
 * 文件大小通常由 picker 直接返回；只有缺失时才按需加载 expo-file-system 查询。
 */
async function resolveAssetSize(asset: PickedAsset): Promise<number> {
  if (typeof asset.size === 'number') return asset.size;
  const { File } = await import('expo-file-system');
  return new File(asset.uri).size;
}

async function encodePickedAsset(asset: PickedAsset, limits: AttachmentLimits, mime: string) {
  if (asset.kind === 'image') {
    const { encodeImage } = await import('@/features/chat/attachments/image-encoder');
    return encodeImage(asset, limits);
  }
  const { encodeNativeFile } = await import('@/features/chat/attachments/native-file-encoder');
  return { ...(await encodeNativeFile(asset.uri, mime)), mime, uri: asset.uri };
}

function useAttachmentCollection(limits: AttachmentLimits) {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const attachmentsRef = useRef(attachments);

  const replaceAttachment = useCallback(
    (id: string, patch: Partial<ComposerAttachment>) => {
      setAttachments((current) => {
        const next = current.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        );
        attachmentsRef.current = next;
        return next;
      });
    },
    [],
  );

  const enqueue = useCallback(async (assets: PickedAsset[]) => {
    setError(null);
    let current = attachmentsRef.current;
    const slots = Math.max(0, limits.maxCount - current.length);
    if (slots === 0) {
      setError(attachmentErrorMessage('too_many_attachments', limits));
      return;
    }
    const accepted = assets.slice(0, slots);
    if (assets.length > slots) {
      setError(attachmentErrorMessage('too_many_attachments', limits));
    }

    for (const asset of accepted) {
      const knownSize = await resolveAssetSize(asset);
      const mime = resolvedAttachmentMime(asset);
      const validationError = validateAttachmentCandidate({
        asset,
        current,
        knownSize,
        limits,
        mime,
      });
      if (validationError || !mime) {
        setError(attachmentErrorMessage(validationError ?? 'unsupported_type', limits));
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
        const encoded = await encodePickedAsset(asset, limits, mime);
        const otherDecoded = attachmentsRef.current
          .filter((item) => item.id !== id)
          .reduce((sum, item) => sum + (item.encodedBytes ?? item.size), 0);
        if (otherDecoded + encoded.bytes > limits.maxTotalBytes) {
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
        replaceAttachment(id, {
          status: 'error',
          error: attachmentErrorMessage(code, limits),
        });
      }
    }
  }, [limits, replaceAttachment]);

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

  return {
    attachments,
    attachmentsRef,
    error,
    setError,
    enqueue,
    remove,
    clear,
  };
}

export function useAttachments(limits?: WebUIIngressLimits) {
  const resolvedLimits = ingressLimits(limits);
  const collection = useAttachmentCollection(resolvedLimits);
  const {
    attachments,
    attachmentsRef,
    clear,
    enqueue,
    error,
    remove,
    setError,
  } = collection;

  const ensurePickerCapacity = useCallback((): number | null => {
    const remaining = resolvedLimits.maxCount - attachmentsRef.current.length;
    if (remaining > 0) return remaining;
    setError(attachmentErrorMessage('too_many_attachments', resolvedLimits));
    return null;
  }, [attachmentsRef, resolvedLimits, setError]);

  const pickImages = useCallback(async () => {
    const remaining = ensurePickerCapacity();
    if (remaining === null) return;
    setError(null);
    try {
      const ImagePicker = await import('expo-image-picker');
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
  }, [enqueue, ensurePickerCapacity, setError]);

  const pickDocuments = useCallback(async () => {
    if (ensurePickerCapacity() === null) return;
    setError(null);
    try {
      const DocumentPicker = await import('expo-document-picker');
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
  }, [enqueue, ensurePickerCapacity, setError]);

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
