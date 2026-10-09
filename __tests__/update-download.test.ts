import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadUpdate, installUpdate, openInstallPermission } from '@/features/updates/download';
import type { UpdateCandidate } from '@/features/updates/model';

type Location = { uri: string };

const native = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  availableDiskSpace: Number.MAX_SAFE_INTEGER,
  delete: vi.fn<(uri: string) => void>(),
  move: vi.fn<(source: string, destination: string) => void>(),
  download: vi.fn<(url: string, destination: Location, options: { onProgress?: (event: { bytesWritten: number }) => void }) => Promise<Location>>(),
  startActivity: vi.fn<(action: string, options: { data: string; type?: string; flags?: number }) => Promise<void>>(),
}));

// 只模拟 Expo 文件与安装器边界；下载完成后必须直接进入安装流程，不再引入哈希计算。
vi.mock('expo-file-system', () => {
  const joinUri = (parts: (string | Location)[]) => parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');

  class File {
    uri: string;
    static downloadFileAsync = native.download;
    constructor(...parts: (string | Location)[]) { this.uri = joinUri(parts); }
    get exists() { return native.files.has(this.uri); }
    get size() { return native.files.get(this.uri)?.length ?? 0; }
    get contentUri() { return `content://nanobot/${this.uri.replaceAll('/', '_')}`; }
    delete() { native.delete(this.uri); native.files.delete(this.uri); }
    async move(destination: Location) {
      native.move(this.uri, destination.uri);
      const bytes = native.files.get(this.uri);
      if (!bytes) throw new Error('missing file');
      native.files.set(destination.uri, bytes);
      native.files.delete(this.uri);
      this.uri = destination.uri;
    }
  }

  class Directory {
    uri: string;
    constructor(...parts: (string | Location)[]) { this.uri = joinUri(parts); }
    create() { /* 测试中的目录创建没有原生副作用。 */ }
    list() {
      return [...native.files.keys()]
        .filter((uri) => uri.startsWith(this.uri + '/'))
        .map((uri) => new File(uri));
    }
  }

  return {
    File,
    Directory,
    Paths: { cache: 'file:///cache', get availableDiskSpace() { return native.availableDiskSpace; } },
  };
});
vi.mock('expo-intent-launcher', () => ({ startActivityAsync: native.startActivity }));

const createFixture = () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (index * 17 + 3) % 251);
  const candidate: UpdateCandidate = {
    version: '1.0.6-dev.243',
    versionCode: 243,
    apkUrl: 'https://github.com/yaotutu/nanobot-client/releases/download/dev-243/nanobot-v1.0.6-dev.243.apk',
    size: bytes.length,
    publishedAt: '2026-10-08T00:00:00Z',
    notes: 'fixture',
  };
  const uri = 'file:///cache/app-updates/243.apk';
  const partialUri = 'file:///cache/app-updates/243.apk.partial';
  const controller = new AbortController();
  const progress = vi.fn<(bytes: number) => void>();
  native.download.mockImplementation(async (_url, destination, options) => {
    native.files.set(destination.uri, bytes.slice());
    options.onProgress?.({ bytesWritten: bytes.length });
    return destination;
  });
  const download = () => downloadUpdate(candidate, controller.signal, progress);
  return { bytes, candidate, uri, partialUri, controller, progress, download };
};

beforeEach(() => {
  vi.resetAllMocks();
  native.files.clear();
  native.availableDiskSpace = Number.MAX_SAFE_INTEGER;
  native.download.mockResolvedValue({ uri: 'file:///unused' });
  native.startActivity.mockResolvedValue(undefined);
});

describe('APK 下载和安装', () => {
  it('下载完成后不校验哈希，直接打开系统安装器', async () => {
    const fixture = createFixture();
    const uri = await fixture.download();
    expect(uri).toBe(fixture.uri);
    expect(fixture.progress.mock.calls).toEqual([[fixture.bytes.length]]);
    expect(native.move).toHaveBeenCalledWith(fixture.partialUri, fixture.uri);

    await installUpdate(fixture.candidate, uri);
    expect(native.startActivity).toHaveBeenCalledExactlyOnceWith('android.intent.action.VIEW', {
      data: `content://nanobot/${uri.replaceAll('/', '_')}`,
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
  });

  it('已存在完整文件名时复用缓存，不重新下载', async () => {
    const fixture = createFixture();
    native.files.set(fixture.uri, fixture.bytes.slice());
    await expect(fixture.download()).resolves.toBe(fixture.uri);
    expect(native.download).not.toHaveBeenCalled();
    expect(fixture.progress).not.toHaveBeenCalled();
  });

  it('下载失败时删除 partial，不留下可安装文件', async () => {
    const fixture = createFixture();
    native.download.mockImplementation(async (_url, destination) => {
      native.files.set(destination.uri, fixture.bytes.slice(0, 8));
      throw new Error('network');
    });
    await expect(fixture.download()).rejects.toThrow('network');
    expect(native.delete).toHaveBeenCalledWith(fixture.partialUri);
    expect(native.files.has(fixture.partialUri)).toBe(false);
    expect(native.move).not.toHaveBeenCalled();
  });

  it('开始下载前取消时不再发起网络请求', async () => {
    const fixture = createFixture();
    fixture.controller.abort();
    await expect(fixture.download()).rejects.toThrow('cancelled');
    expect(native.download).not.toHaveBeenCalled();
  });

  it('磁盘不足时不下载，也不打开安装器', async () => {
    const fixture = createFixture();
    native.availableDiskSpace = fixture.bytes.length + 20 * 1024 * 1024 - 1;
    await expect(fixture.download()).rejects.toMatchObject({ code: 'storage' });
    expect(native.download).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('安装拒绝更新缓存目录外的 URI', async () => {
    const fixture = createFixture();
    native.files.set('file:///downloads/update.apk', fixture.bytes.slice());
    await expect(installUpdate(fixture.candidate, 'file:///downloads/update.apk'))
      .rejects.toMatchObject({ code: 'installation' });
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('安装拒绝已经被系统清理的缓存文件', async () => {
    const fixture = createFixture();
    await expect(installUpdate(fixture.candidate, fixture.uri))
      .rejects.toMatchObject({ code: 'download' });
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('安装权限入口指定当前应用 package', async () => {
    await openInstallPermission();
    expect(native.startActivity).toHaveBeenCalledExactlyOnceWith('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
      data: 'package:com.anonymous.nanobotclient',
    });
  });
});
