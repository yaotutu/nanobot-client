/**
 * 消息媒体展示的纯模型。
 *
 * 去重键同时包含媒体类型、URL 和名称：相同资源不会重复渲染，而只有名称的占位附件仍可
 * 保留给 UI 展示；URL 和名称都为空的无效项会在进入 Gallery 前过滤。
 */
import type { UIMediaAttachment } from '@/types/api/chat/media';

export interface MediaPalette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
}

export function uniqueMediaAttachments(
  attachments: UIMediaAttachment[],
): UIMediaAttachment[] {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = `${attachment.kind}\u0000${attachment.url ?? ''}\u0000${attachment.name ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(attachment.url || attachment.name);
  });
}
