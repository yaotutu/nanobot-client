export function chatIdFromKey(key: string | null): string | null {
  if (!key) return null;
  const separator = key.indexOf(':');
  return separator < 0 ? key : key.slice(separator + 1);
}
