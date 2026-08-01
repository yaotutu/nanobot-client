/**
 * Release-build safe debug logging. console.warn/log are stripped by the
 * minifier in production Hermes bytecode builds, so we store messages in a
 * global array and render them on-screen via <DebugOverlay/>. This survives
 * minification because it uses plain object/array operations + React state,
 * not console calls.
 *
 * IMPORTANT: listener notification is DEFERRED to a microtask. This prevents
 * the React error "Cannot update a component while rendering a different
 * component", which fires when debugLog() is called during a render phase
 * (e.g. inside HomeScreen / RootLayout bodies) and would otherwise
 * synchronously trigger DebugOverlay's setState.
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
let notifyPending = false;

function scheduleNotify(): void {
  if (notifyPending) return;
  notifyPending = true;
  // Defer to a microtask so we never synchronously trigger a setState on
  // another component during its render phase.
  const run = () => {
    notifyPending = false;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* ignore */
      }
    }
  };
  // Prefer queueMicrotask; fall back to setTimeout for older runtimes.
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(run);
  } else {
    setTimeout(run, 0);
  }
}

export function debugLog(tag: string, msg: string): void {
  entries.push({ ts: Date.now(), tag, msg });
  if (entries.length > MAX_ENTRIES) entries.shift();
  version += 1;
  scheduleNotify();
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
