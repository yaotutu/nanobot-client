import { useEffect, useState } from 'react';

export function useResolvedFilePreviewAvailability(
  path: string | undefined,
  onOpenFilePreview: ((path: string) => void) | undefined,
  resolve: ((path: string) => Promise<boolean>) | undefined,
): boolean {
  const [result, setResult] = useState<{
    available: boolean;
    path: string;
    resolve: (path: string) => Promise<boolean>;
  } | null>(null);

  useEffect(() => {
    if (!path || !onOpenFilePreview || !resolve) return;
    let cancelled = false;
    void resolve(path)
      .then((available) => {
        if (!cancelled) setResult({ available, path, resolve });
      })
      .catch(() => {
        if (!cancelled) setResult({ available: false, path, resolve });
      });
    return () => {
      cancelled = true;
    };
  }, [onOpenFilePreview, path, resolve]);

  if (!path || !onOpenFilePreview) return false;
  if (!resolve) return true;
  return result?.resolve === resolve && result.path === path && result.available;
}
