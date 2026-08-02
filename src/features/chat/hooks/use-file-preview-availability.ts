import { useCallback, useRef } from 'react';

import { fetchFilePreviewAvailability } from '@/features/chat/api';
import { ApiError } from '@/services/api/api';

interface CacheEntry {
  available?: boolean;
  promise: Promise<boolean>;
  revision: number;
}

export function useFilePreviewAvailability(options: {
  activeKey: string | null;
  apiToken: string;
  revision: number;
}) {
  const { activeKey, apiToken, revision } = options;
  const cacheRef = useRef(new Map<string, CacheEntry>());

  return useCallback((path: string) => {
    if (!activeKey) return Promise.resolve(false);
    const cacheKey = `${apiToken}\n${activeKey}\n${path}`;
    const cache = cacheRef.current;
    const cached = cache.get(cacheKey);
    if (cached && (cached.available !== false || cached.revision === revision)) return cached.promise;

    const pending = fetchFilePreviewAvailability(activeKey, path).catch((error: unknown) => {
      if (error instanceof ApiError) {
        if (error.status === 404 && /API route not found/i.test(error.message)) return true;
        if ([400, 403, 404, 415].includes(error.status)) return false;
      }
      return false;
    });
    const entry: CacheEntry = { promise: pending, revision };
    cache.set(cacheKey, entry);
    void pending.then((available) => {
      if (cache.get(cacheKey) === entry) entry.available = available;
    });
    return pending;
  }, [activeKey, apiToken, revision]);
}
