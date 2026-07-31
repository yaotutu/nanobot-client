import { useCallback, useMemo, useState } from 'react';

const loadedLogoUrls = new Set<string>();
const failedLogoUrls = new Set<string>();
const resolvedLogoIndexByKey = new Map<string, number>();

function logoCacheKey(urls: readonly string[]): string {
  return urls.join('\n');
}

function logoUrlsFromKey(key: string): string[] {
  return key ? key.split('\n') : [];
}

function firstUsableLogoIndex(urls: readonly string[]): number {
  const key = logoCacheKey(urls);
  const cachedIndex = resolvedLogoIndexByKey.get(key);
  if (
    typeof cachedIndex === 'number'
    && cachedIndex >= 0
    && cachedIndex < urls.length
    && !failedLogoUrls.has(urls[cachedIndex])
  ) {
    return cachedIndex;
  }

  const loadedIndex = urls.findIndex((url) => loadedLogoUrls.has(url));
  if (loadedIndex >= 0) {
    resolvedLogoIndexByKey.set(key, loadedIndex);
    return loadedIndex;
  }

  return urls.findIndex((url) => !failedLogoUrls.has(url));
}

function nextLogoIndex(urls: readonly string[], afterIndex: number): number {
  for (let index = afterIndex + 1; index < urls.length; index += 1) {
    if (!failedLogoUrls.has(urls[index])) return index;
  }
  return -1;
}

interface LogoSelection {
  cacheKey: string;
  index: number;
}

export function useLogoFallback(urls: readonly string[] | undefined) {
  const cacheKey = useMemo(() => logoCacheKey(urls?.filter(Boolean) ?? []), [urls]);
  const safeUrls = useMemo(() => logoUrlsFromKey(cacheKey), [cacheKey]);
  const [selection, setSelection] = useState<LogoSelection>(() => ({
    cacheKey,
    index: firstUsableLogoIndex(safeUrls),
  }));
  const logoIndex = selection.cacheKey === cacheKey
    ? selection.index
    : firstUsableLogoIndex(safeUrls);
  const logoUrl = logoIndex >= 0 ? safeUrls[logoIndex] : undefined;
  const logoLoaded = Boolean(logoUrl && loadedLogoUrls.has(logoUrl));

  const onLogoLoad = useCallback(() => {
    if (!logoUrl || logoIndex < 0) return;
    loadedLogoUrls.add(logoUrl);
    failedLogoUrls.delete(logoUrl);
    resolvedLogoIndexByKey.set(cacheKey, logoIndex);
    setSelection({ cacheKey, index: logoIndex });
  }, [cacheKey, logoIndex, logoUrl]);

  const onLogoError = useCallback(() => {
    if (!logoUrl || logoIndex < 0) return;
    failedLogoUrls.add(logoUrl);
    if (resolvedLogoIndexByKey.get(cacheKey) === logoIndex) {
      resolvedLogoIndexByKey.delete(cacheKey);
    }
    setSelection({ cacheKey, index: nextLogoIndex(safeUrls, logoIndex) });
  }, [cacheKey, logoIndex, logoUrl, safeUrls]);

  return { logoUrl, logoLoaded, onLogoLoad, onLogoError };
}
