/** 更新只读取客户端仓库的最新发布，不依赖 nanobot 网关或鉴权。 */
export const UPDATE_REPOSITORY = 'yaotutu/nanobot-client';
export const UPDATE_PACKAGE = 'com.anonymous.nanobotclient';
export const UPDATE_INFO_URL = 'https://github.com/' + UPDATE_REPOSITORY + '/releases/latest/download/update.json';
export const CHECK_INTERVAL = 10 * 60 * 1000;

export type UpdateErrorCode = 'network' | 'rateLimit' | 'invalid' | 'download' | 'integrity' | 'installation' | 'storage';
export class UpdateError extends Error {
  constructor(public code: UpdateErrorCode, public retryAt = 0) {
    super(code);
  }
}

/** 一份平铺清单：升级顺序仅由 versionCode 决定，展示版本和标签不参与比较。 */
export interface UpdateCandidate {
  version: string;
  versionCode: number;
  apkUrl: string;
  size: number;
  sha256: string;
  publishedAt: string;
  notes: string;
}

export interface UpdateRuntime {
  version: string | null;
  versionCode: number;
  supported: boolean;
  development: boolean;
}

// APK 路径仅限制来源与文件类型，标签内容不参与版本比较。
const apkAssetPath = new RegExp('^/' + UPDATE_REPOSITORY + '/releases/download/[^/]+/[^/]+\\.apk$');
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/** 只接受新格式及本仓库的 HTTPS APK 地址；不读取旧清单，也不从标签推算版本。 */
export function parseUpdateInfo(value: unknown): UpdateCandidate {
  if (!record(value) || typeof value.version !== 'string' || !value.version.trim()
    || !positiveInteger(value.versionCode) || value.versionCode > 2100000000
    || !positiveInteger(value.size) || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)
    || typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt))
    || typeof value.notes !== 'string' || typeof value.apkUrl !== 'string') throw new UpdateError('invalid');
  try {
    const url = new URL(value.apkUrl);
    if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash
      || !apkAssetPath.test(url.pathname)) throw new Error('invalid APK URL');
  } catch { throw new UpdateError('invalid'); }
  return { version: value.version, versionCode: value.versionCode, apkUrl: value.apkUrl, size: value.size,
    sha256: value.sha256, publishedAt: value.publishedAt, notes: value.notes };
}
