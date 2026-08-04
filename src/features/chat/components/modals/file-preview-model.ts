/**
 * 文件预览的纯展示模型。
 *
 * 网络请求仍由 modal 组件管理；此处只保留可测试的错误映射、breadcrumb 压缩和跨组件
 * palette/state 类型，避免语法高亮组件反向依赖整个 modal。
 */
import { ApiError } from '@/services/api/api';
import i18n from '@/i18n';
import type { FilePreviewPayload } from '@/types/api/chat/file-preview';

export interface FilePreviewPalette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
  errorText: string;
}

export type FilePreviewState =
  | { requestKey: string; status: 'error'; error: unknown }
  | { requestKey: string; status: 'ready'; payload: FilePreviewPayload };

export interface FilePreviewBreadcrumb {
  prefix: string | null;
  parts: string[];
}

export function previewErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404 && /API route not found/i.test(error.message)) {
      return i18n.t('filePreview.routeMissing');
    }
    return error.message;
  }
  return i18n.t('filePreview.failed');
}

export function compactFilePreviewBreadcrumb(path: string): FilePreviewBreadcrumb {
  const normalized = path.replace(/\\/g, '/');
  const allParts = normalized.split('/').filter(Boolean);
  const parts = allParts.length > 3 ? allParts.slice(-3) : allParts;
  return {
    prefix: allParts.length > parts.length ? '…' : normalized.startsWith('/') ? '/' : null,
    parts,
  };
}
