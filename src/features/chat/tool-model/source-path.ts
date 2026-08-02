export function isCollectedSourcePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return (
    normalized.includes('/.nanobot/tool-results/') ||
    normalized.includes('/nanobot/tool-results/')
  );
}
