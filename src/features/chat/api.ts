import { apiClient, ApiError } from '@/services/api/api';
import type {
  FetchThreadOptions,
  FilePreviewPayload,
  WebuiThreadPersistedPayload,
} from '@/types/api/chat';

export interface FetchThreadRequestOptions extends FetchThreadOptions {
  signal?: AbortSignal;
}

export async function fetchThread(
  key: string,
  options: FetchThreadRequestOptions = {},
): Promise<WebuiThreadPersistedPayload | null> {
  const query: Record<string, string | number> = {};
  if (options.limit !== undefined) query.limit = options.limit;
  if (options.direction) query.direction = options.direction;
  if (options.before) query.before = options.before;
  try {
    return await apiClient.request<WebuiThreadPersistedPayload>(
      `/api/sessions/${encodeURIComponent(key)}/webui-thread`,
      { method: 'GET', query, signal: options.signal },
    );
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) return null;
    throw caught;
  }
}

export async function fetchFilePreview(key: string, path: string): Promise<FilePreviewPayload> {
  return apiClient.get<FilePreviewPayload>(
    `/api/sessions/${encodeURIComponent(key)}/file-preview`,
    { path },
  );
}

export async function fetchFilePreviewAvailability(key: string, path: string): Promise<boolean> {
  const payload = await apiClient.get<{ available?: boolean }>(
    `/api/sessions/${encodeURIComponent(key)}/file-preview`,
    { path, probe: 1 },
  );
  return payload.available !== false;
}
