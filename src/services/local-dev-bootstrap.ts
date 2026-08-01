type MetroRequireContext = {
  keys(): string[];
  (id: string): unknown;
};

type MetroRequire = {
  context(directory: string, useSubdirectories: boolean, pattern: RegExp): MetroRequireContext;
};

declare const require: MetroRequire;

/**
 * Loads the optional, gitignored local development credential.
 *
 * `require.context` keeps clean checkouts valid when dev-secret.ts is absent,
 * while Metro can still include it for a developer who created the local file.
 */
export function loadLocalDevBootstrapSecret(): string {
  if (!__DEV__) return "";
  try {
    const context = require.context(".", false, /^\.\/dev-secret\.ts$/);
    const key = context.keys().find((candidate) => candidate === "./dev-secret.ts");
    if (!key) return "";
    const loaded = context(key) as { DEV_BOOTSTRAP_SECRET?: unknown };
    return typeof loaded.DEV_BOOTSTRAP_SECRET === "string"
      ? loaded.DEV_BOOTSTRAP_SECRET.trim()
      : "";
  } catch {
    return "";
  }
}
