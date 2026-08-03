export function decodedBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function projectedDataUrlBytes(mime: string, decodedBytes: number): number {
  return `data:${mime};base64,`.length + 4 * Math.ceil(decodedBytes / 3);
}
