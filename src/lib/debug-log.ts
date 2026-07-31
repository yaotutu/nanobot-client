/**
 * Release-build safe debug logging. console.warn/log are stripped by the
 * minifier in production Hermes bytecode builds, so we store messages in a
 * global array and render them on-screen via <DebugOverlay/>. This survives
 * minification because it uses plain object/array operations + React state,
 * not console calls.
 */

export interface DebugEntry {
  ts: number;
  tag: string;
  msg: string;
}

const MAX_ENTRIES = 40;
const entries: DebugEntry[] = [];
let version = 0;
const listeners = new Set<() => void>();

export function debugLog(tag: string, msg: string): void {
  entries.push({ ts: Date.now(), tag, msg });
  if (entries.length > MAX_ENTRIES) entries.shift();
  version += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function getDebugEntries(): DebugEntry[] {
  return entries.slice();
}

export function getDebugVersion(): number {
  return version;
}

export function subscribeDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
