import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadUpdate, installUpdate, openInstallPermission } from '@/features/updates/download';
import type { UpdateCandidate } from '@/features/updates/model';

type Location = { uri: string };
type DownloadOptions = {
  idempotent?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: { bytesWritten: number; totalBytes: number }) => void;
};
const chunkSize = 1024 * 1024;
const storageReserve = 20 * 1024 * 1024;

// 只模拟 Expo 原生边界，不 mock noble：被测模块必须用真实分块 SHA-256 完成校验。
// 所有文件字节保存在内存 Map 中；句柄只按 offset 读取，未提供整文件读取的替代接口。
const native = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  downloadDestinations: [] as string[],
  availableDiskSpace: Number.MAX_SAFE_INTEGER,
  contentUri: 'content://nanobot-test-provider/verified-update.apk',
  createDirectory: vi.fn<(options: { idempotent?: boolean; intermediates?: boolean }) => void>(),
  download: vi.fn<(url: string, destination: Location, options: DownloadOptions) => Promise<Location>>(),
  read: vi.fn<(uri: string, offset: number, count: number) => Uint8Array>(),
  open: vi.fn<(uri: string) => void>(),
  close: vi.fn<(uri: string) => void>(),
  delete: vi.fn<(uri: string) => void>(),
  move: vi.fn<(source: string, destination: string) => void>(),
  startActivity: vi.fn<(action: string, options: { data: string; type?: string; flags?: number }) => Promise<void>>(),
}));

vi.mock('expo-file-system', () => {
  const joinUri = (parts: (string | Location)[]) => parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
  // 类仅用于保持生产代码的构造函数与 instanceof File 语义，不扩展无关原生 API。
  class File {
    uri: string;
    static downloadFileAsync = native.download;
    constructor(...parts: (string | Location)[]) { this.uri = joinUri(parts); }
    get exists() { return native.files.has(this.uri); }
    get size() { return native.files.get(this.uri)?.length ?? 0; }
    get contentUri() { return native.contentUri; }
    delete() {
      native.delete(this.uri);
      native.files.delete(this.uri);
    }
    async move(destination: Location) {
      native.move(this.uri, destination.uri);
      const bytes = native.files.get(this.uri);
      if (!bytes) throw new Error('missing file');
      native.files.set(destination.uri, bytes);
      native.files.delete(this.uri);
      // Expo move 完成后源对象的 uri 也会更新，不保留已经不存在的 partial 路径。
      this.uri = destination.uri;
    }
    open() {
      const uri = this.uri;
      native.open(uri);
      let offset = 0;
      return {
        get offset() { return offset; },
        readBytes(count: number) {
          const bytes = native.read(uri, offset, count);
          offset += bytes.length;
          return bytes;
        },
        close: () => native.close(uri),
      };
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | Location)[]) { this.uri = joinUri(parts); }
    create(options: { idempotent?: boolean; intermediates?: boolean }) { native.createDirectory(options); }
    list() {
      return [...native.files.keys()].filter((uri) => uri.startsWith(this.uri + '/')).map((uri) => new File(uri));
    }
  }
  return {
    File,
    Directory,
    Paths: { cache: 'file:///cache', get availableDiskSpace() { return native.availableDiskSpace; } },
  };
});
vi.mock('expo-intent-launcher', () => ({ startActivityAsync: native.startActivity }));

beforeEach(() => {
  vi.resetAllMocks();
  native.files.clear();
  native.downloadDestinations.length = 0;
  native.availableDiskSpace = Number.MAX_SAFE_INTEGER;
  native.read.mockImplementation((uri, offset, count) => native.files.get(uri)?.slice(offset, offset + count) ?? new Uint8Array());
  native.startActivity.mockResolvedValue(undefined);
});

// 使用 Node 的 SHA-256 独立生成清单期望，避免被测 noble 实现和测试共享一份哈希结果。
// 大文件用不同字节模式跨越多个 1MiB 块，能识别 offset 错误、漏块和重复块。
const createFixture = (size = 32) => {
  const bytes = Uint8Array.from({ length: size }, (_, index) => (index * 17 + 3) % 251);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const candidate: UpdateCandidate = {
    version: '1.0.6-dev.243', versionCode: 243,
    apkUrl: 'https://github.com/yaotutu/nanobot-client/releases/download/dev-243/nanobot-v1.0.6-dev.243.apk',
    publishedAt: '2026-10-08T00:00:00Z', notes: 'fixture', size: bytes.length, sha256,
  };
  const uri = `file:///cache/app-updates/${sha256}.apk`;
  const partialUri = `file:///cache/app-updates/${sha256}.partial`;
  const controller = new AbortController();
  const progress = vi.fn<(bytes: number, verifying?: boolean) => void>();
  native.download.mockImplementation(async (_url, destination, options) => {
    // move 会更新 File 对象的 uri，因此记录调用当时的路径而非事后读取 mock 参数引用。
    native.downloadDestinations.push(destination.uri);
    native.files.set(destination.uri, bytes.slice());
    options.onProgress?.({ bytesWritten: bytes.length, totalBytes: bytes.length });
    return destination;
  });
  const download = () => downloadUpdate(candidate, controller.signal, progress);
  return { bytes, candidate, uri, partialUri, controller, progress, download };
};

// 同长度的坏字节和长度不一致分别覆盖 hash/size 校验，不能用同一种损坏掩盖另一条分支。
const damagedBytes = (bytes: Uint8Array, kind: string) => {
  if (kind === 'size') return bytes.slice(0, bytes.length - 1);
  const damaged = bytes.slice();
  damaged[0] ^= 0xff;
  return damaged;
};

describe('APK 下载、校验和安装', () => {
  it('真实 noble 分块 SHA 与独立期望一致，下载校验后移动文件，安装前再次分块验证', async () => {
    const fixture = createFixture(chunkSize * 2 + 37);
    const uri = await fixture.download();
    expect(uri).toBe(fixture.uri);
    expect(native.read.mock.calls).toEqual([
      [fixture.partialUri, 0, chunkSize],
      [fixture.partialUri, chunkSize, chunkSize],
      [fixture.partialUri, chunkSize * 2, 37],
    ]);
    expect(native.move).toHaveBeenCalledWith(fixture.partialUri, fixture.uri);
    expect(native.files.has(fixture.partialUri)).toBe(false);
    const downloadedBytes = native.files.get(fixture.uri)!;
    expect(downloadedBytes.length).toBe(fixture.bytes.length);
    expect(createHash('sha256').update(downloadedBytes).digest('hex')).toBe(fixture.candidate.sha256);
    expect(native.downloadDestinations).toEqual([fixture.partialUri]);
    expect(native.download).toHaveBeenCalledWith(fixture.candidate.apkUrl, expect.anything(), {
      idempotent: true, signal: fixture.controller.signal, onProgress: expect.any(Function),
    });
    expect(fixture.progress.mock.calls).toEqual([[fixture.bytes.length], [fixture.bytes.length, true]]);
    expect(native.createDirectory).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
    expect(native.startActivity).not.toHaveBeenCalled();

    await installUpdate(fixture.candidate, uri);
    expect(native.read.mock.calls.slice(3)).toEqual([
      [fixture.uri, 0, chunkSize],
      [fixture.uri, chunkSize, chunkSize],
      [fixture.uri, chunkSize * 2, 37],
    ]);
    expect(native.close.mock.calls).toEqual([[fixture.partialUri], [fixture.uri]]);
    expect(native.startActivity).toHaveBeenCalledExactlyOnceWith('android.intent.action.VIEW', {
      data: native.contentUri, type: 'application/vnd.android.package-archive', flags: 1,
    });
    expect(native.startActivity.mock.invocationCallOrder[0]).toBeGreaterThan(native.close.mock.invocationCallOrder[1]);
  });

  it.each(['hash', 'size'])('下载文件 %s 不一致时删除 partial，不移动文件、不调用安装器', async (kind) => {
    const fixture = createFixture();
    native.download.mockImplementation(async (_url, destination) => {
      native.files.set(destination.uri, damagedBytes(fixture.bytes, kind));
      return destination;
    });
    await expect(fixture.download().then((uri) => installUpdate(fixture.candidate, uri))).rejects.toMatchObject({ code: 'integrity' });
    expect(native.delete).toHaveBeenCalledWith(fixture.partialUri);
    expect(native.files.has(fixture.partialUri)).toBe(false);
    expect(native.files.has(fixture.uri)).toBe(false);
    expect(native.move).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
    if (kind === 'hash') expect(native.close).toHaveBeenCalledWith(fixture.partialUri);
    else expect(native.open).not.toHaveBeenCalled();
  });

  it('缓存复用每次都重新验证，即使可用磁盘不足也不重新下载有效文件', async () => {
    const fixture = createFixture();
    native.files.set(fixture.uri, fixture.bytes.slice());
    native.availableDiskSpace = 0;
    await expect(fixture.download()).resolves.toBe(fixture.uri);
    await expect(fixture.download()).resolves.toBe(fixture.uri);
    expect(native.read.mock.calls).toEqual([[fixture.uri, 0, fixture.bytes.length], [fixture.uri, 0, fixture.bytes.length]]);
    expect(native.close).toHaveBeenCalledTimes(2);
    expect(fixture.progress.mock.calls).toEqual([[fixture.bytes.length, true], [fixture.bytes.length, true]]);
    expect(native.download).not.toHaveBeenCalled();
    expect(native.delete).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it.each(['hash', 'size'])('缓存 %s 损坏时删除旧缓存并重新下载校验', async (kind) => {
    const fixture = createFixture();
    native.files.set(fixture.uri, damagedBytes(fixture.bytes, kind));
    await expect(fixture.download()).resolves.toBe(fixture.uri);
    expect(native.delete).toHaveBeenCalledWith(fixture.uri);
    expect(native.download).toHaveBeenCalledTimes(1);
    expect(native.files.get(fixture.uri)).toEqual(fixture.bytes);
    await installUpdate(fixture.candidate, fixture.uri);
    expect(native.startActivity).toHaveBeenCalledTimes(1);
  });

  it.each(['hash', 'size'])('下载校验成功后缓存被修改（%s），安装复验必须拒绝', async (kind) => {
    const fixture = createFixture();
    await fixture.download();
    native.files.set(fixture.uri, damagedBytes(fixture.bytes, kind));
    await expect(installUpdate(fixture.candidate, fixture.uri)).rejects.toMatchObject({ code: 'integrity' });
    expect(native.startActivity).not.toHaveBeenCalled();
    if (kind === 'hash') expect(native.close).toHaveBeenLastCalledWith(fixture.uri);
  });

  it('下载进度回调触发取消后，删除已写入的 partial 而不校验或安装', async () => {
    const fixture = createFixture();
    fixture.progress.mockImplementation(() => fixture.controller.abort());
    await expect(fixture.download()).rejects.toThrow('cancelled');
    expect(native.download).toHaveBeenCalledTimes(1);
    expect(native.delete).toHaveBeenCalledWith(fixture.partialUri);
    expect(native.files.has(fixture.partialUri)).toBe(false);
    expect(native.open).not.toHaveBeenCalled();
    expect(native.move).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('原生下载中止并拒绝时，也删除 Android 可能残留的 partial', async () => {
    const fixture = createFixture();
    const error = new Error('native download aborted');
    native.download.mockImplementation(async (_url, destination) => {
      native.files.set(destination.uri, fixture.bytes.slice(0, 8));
      fixture.controller.abort();
      throw error;
    });
    await expect(fixture.download()).rejects.toBe(error);
    expect(native.delete).toHaveBeenCalledWith(fixture.partialUri);
    expect(native.files.has(fixture.partialUri)).toBe(false);
    expect(native.move).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('分块校验中取消时关闭句柄并删除 partial，不能留下可安装缓存', async () => {
    const fixture = createFixture(chunkSize + 37);
    native.read.mockImplementationOnce((uri, offset, count) => {
      fixture.controller.abort();
      return native.files.get(uri)!.slice(offset, offset + count);
    });
    await expect(fixture.download()).rejects.toThrow('cancelled');
    expect(native.read).toHaveBeenCalledTimes(1);
    expect(native.close).toHaveBeenCalledWith(fixture.partialUri);
    expect(native.delete).toHaveBeenCalledWith(fixture.partialUri);
    expect(native.files.has(fixture.uri)).toBe(false);
    expect(native.files.has(fixture.partialUri)).toBe(false);
    expect(native.move).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('开始前已取消时不调用下载，也不启动安装器', async () => {
    const fixture = createFixture();
    fixture.controller.abort();
    await expect(fixture.download()).rejects.toThrow('cancelled');
    expect(native.download).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('磁盘不足 APK 大小加 20MiB 预留时失败，不下载、不安装', async () => {
    const fixture = createFixture();
    native.availableDiskSpace = fixture.bytes.length + storageReserve - 1;
    await expect(fixture.download()).rejects.toMatchObject({ code: 'storage' });
    expect(native.download).not.toHaveBeenCalled();
    expect(native.open).not.toHaveBeenCalled();
    expect(native.files.has(fixture.partialUri)).toBe(false);
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('可用磁盘刚好满足 APK 加预留空间时可以完成下载', async () => {
    const fixture = createFixture();
    native.availableDiskSpace = fixture.bytes.length + storageReserve;
    await expect(fixture.download()).resolves.toBe(fixture.uri);
    expect(native.download).toHaveBeenCalledTimes(1);
  });

  it('句柄提前读到空块时视为完整性错误，关闭句柄并删除 partial', async () => {
    const fixture = createFixture();
    native.read.mockReturnValueOnce(new Uint8Array());
    await expect(fixture.download()).rejects.toMatchObject({ code: 'integrity' });
    expect(native.close).toHaveBeenCalledWith(fixture.partialUri);
    expect(native.delete).toHaveBeenCalledWith(fixture.partialUri);
    expect(native.move).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('安装拒绝缓存目录外的 URI，即使文件字节和清单完全匹配', async () => {
    const fixture = createFixture();
    const outsideUri = 'file:///downloads/update.apk';
    native.files.set(outsideUri, fixture.bytes.slice());
    await expect(installUpdate(fixture.candidate, outsideUri)).rejects.toMatchObject({ code: 'integrity' });
    expect(native.open).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('安装拒绝已经被系统清理的缓存文件', async () => {
    const fixture = createFixture();
    await expect(installUpdate(fixture.candidate, fixture.uri)).rejects.toMatchObject({ code: 'integrity' });
    expect(native.open).not.toHaveBeenCalled();
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('安装权限入口指定当前应用 package，不能跳转为全局或其他应用设置', async () => {
    await openInstallPermission();
    expect(native.startActivity).toHaveBeenCalledExactlyOnceWith('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
      data: 'package:com.anonymous.nanobotclient',
    });
    expect(native.download).not.toHaveBeenCalled();
  });
});
