import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHECK_INTERVAL, parseUpdateInfo, UPDATE_INFO_URL, UpdateError, type UpdateCandidate } from '@/features/updates/model';
import { findUpdate } from '@/features/updates/release-api';
import { createUpdateStore, hasUpdate, type UpdateDependencies } from '@/features/updates/store';

const candidate = (versionCode = 301): UpdateCandidate => ({ version: '1.0.6-dev.' + versionCode, versionCode,
  apkUrl: 'https://github.com/yaotutu/nanobot-client/releases/download/dev-' + versionCode + '/nanobot.apk',
  size: 1024, publishedAt: '2026-10-08T00:00:00Z', notes: '改进聊天体验' });
const response = (data: unknown) => new Response(JSON.stringify(data));
const deps = (overrides: Partial<UpdateDependencies> = {}): UpdateDependencies => ({
  runtime: { version: '1.0.6', versionCode: 201, supported: true, development: false },
  now: () => 10000000, find: vi.fn(async () => candidate()),
  download: vi.fn(async () => 'file:///cache/downloaded.apk'), install: vi.fn(async () => {}), permission: vi.fn(async () => {}), ...overrides,
});
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
afterEach(() => vi.useRealTimers());

describe('平铺更新协议', () => {
  it('展示版本与发布标签不参与整数版本比较', () => {
    expect(parseUpdateInfo({ ...candidate(), version: '开发测试版', apkUrl: candidate().apkUrl.replace('dev-301', 'any-tag') }))
      .toMatchObject({ version: '开发测试版', versionCode: 301 });
  });
  it('不兼容旧嵌套清单', () => expect(() => parseUpdateInfo({ schemaVersion: 1, manifest: candidate() })).toThrow(UpdateError));
  it.each([
    { versionCode: 0 }, { versionCode: 1.5 }, { versionCode: 2100000001 }, { versionCode: '302' },
    { version: '' }, { size: -1 }, { apkUrl: '' }, { publishedAt: 'bad' }, { notes: null },
    { apkUrl: 'http://github.com/yaotutu/nanobot-client/releases/download/dev-301/app.apk' },
    { apkUrl: 'https://github.com/other/repo/releases/download/dev-301/app.apk' },
    { apkUrl: candidate().apkUrl + '?token=x' }, { apkUrl: candidate().apkUrl + '#x' },
    { apkUrl: 'https://github.com/yaotutu/nanobot-client/releases/download/dev-301/update.json' },
    { apkUrl: 'https://evil.example/app.apk' },
  ])('拒绝无效清单 %j', patch => expect(() => parseUpdateInfo({ ...candidate(), ...patch })).toThrow(UpdateError));
});

describe('Latest 清单检测', () => {
  it('只发一个固定 URL 请求，不遍历 Release 或解析标签', async () => {
    // 显式使用 fetch 的宽入参类型，避免不同 TS lib 对 URL / RequestInfo 多重载的差异。
    const fetcher = vi.fn(async () => response(candidate()));
    expect(await findUpdate(fetcher)).toEqual(candidate());
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(UPDATE_INFO_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it('尚未发布清单的 404 返回暂无更新', async () => {
    expect(await findUpdate(vi.fn().mockResolvedValue(new Response('', { status: 404 })))).toBeNull();
  });
  it.each([403, 500])('HTTP %s 不能伪装成无更新', async status => {
    await expect(findUpdate(vi.fn().mockResolvedValue(new Response('', { status })))).rejects.toMatchObject({ code: 'network' });
  });
  it('尊重 GitHub 明确限流时间', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '1800' } }));
    await expect(findUpdate(fetcher)).rejects.toMatchObject({ code: 'rateLimit', retryAt: expect.any(Number) });
  });
  it('网络、无效 JSON、过大清单明确报错', async () => {
    await expect(findUpdate(vi.fn().mockRejectedValue(new Error('offline')))).rejects.toMatchObject({ code: 'network' });
    await expect(findUpdate(vi.fn().mockResolvedValue(new Response('{bad')))).rejects.toMatchObject({ code: 'invalid' });
    await expect(findUpdate(vi.fn().mockResolvedValue(new Response(' '.repeat(32769))))).rejects.toMatchObject({ code: 'invalid' });
  });
  it('15秒超时中止请求', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
      void _input;
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('timeout')));
      });
    });
    const pending = expect(findUpdate(fetcher)).rejects.toMatchObject({ code: 'network' });
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
  });
});

describe('更新状态与并发', () => {
  it('合并并发检查、10分钟节流，手动可以立即检查', async () => {
    let time = 10000000;
    const wait = deferred<UpdateCandidate>();
    const d = deps({ now: () => time, find: vi.fn(() => wait.promise) });
    const store = createUpdateStore(d);
    const first = store.getState().check();
    expect(store.getState().check(true)).toBe(first);
    wait.resolve(candidate()); await first;
    expect(d.find).toHaveBeenCalledTimes(1);
    expect(hasUpdate(store.getState())).toBe(true);
    expect(d.download).not.toHaveBeenCalled();
    await store.getState().check(); expect(d.find).toHaveBeenCalledTimes(1);
    time += CHECK_INTERVAL; await store.getState().check(); expect(d.find).toHaveBeenCalledTimes(2);
    await store.getState().check(true); expect(d.find).toHaveBeenCalledTimes(3);
  });
  it('进程重新创建后重新请求，不加载旧更新缓存', async () => {
    const d = deps();
    await createUpdateStore(d).getState().check();
    await createUpdateStore(d).getState().check();
    expect(d.find).toHaveBeenCalledTimes(2);
  });
  it('网络失败保留内存已有更新，自动检查节流，手动可立即重试', async () => {
    const find = vi.fn().mockResolvedValueOnce(candidate()).mockRejectedValueOnce(new UpdateError('network')).mockResolvedValue(candidate(401));
    const store = createUpdateStore(deps({ find }));
    await store.getState().check(); await store.getState().check(true);
    expect(store.getState().checkError).toBe('network'); expect(hasUpdate(store.getState())).toBe(true);
    await store.getState().check(); expect(find).toHaveBeenCalledTimes(2);
    await store.getState().check(true); expect(find).toHaveBeenCalledTimes(3); expect(store.getState().candidate?.versionCode).toBe(401);
  });
  it('普通失败仅固定节流，不做指数退避', async () => {
    let time = 10000000;
    const find = vi.fn().mockRejectedValue(new Error('offline'));
    const store = createUpdateStore(deps({ find, now: () => time }));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await store.getState().check(); expect(find).toHaveBeenCalledTimes(attempt + 1);
      await store.getState().check(); expect(find).toHaveBeenCalledTimes(attempt + 1);
      time += CHECK_INTERVAL;
    }
  });
  it('手动也不能绕过明确限流，到期后可恢复请求', async () => {
    let time = 10000000;
    const find = vi.fn().mockRejectedValueOnce(new UpdateError('rateLimit', time + 120000)).mockResolvedValue(candidate());
    const store = createUpdateStore(deps({ find, now: () => time }));
    await store.getState().check(); await store.getState().check(true); expect(find).toHaveBeenCalledTimes(1);
    time += 120000; await store.getState().check(true); expect(find).toHaveBeenCalledTimes(2);
  });
  it('新版切换时废弃旧安装路径，即使两个版本文件哈希相同', async () => {
    const find = vi.fn().mockResolvedValueOnce(candidate()).mockResolvedValueOnce(candidate(302));
    const store = createUpdateStore(deps({ find }));
    await store.getState().check(); await store.getState().download(); await store.getState().check(true);
    expect(store.getState()).toMatchObject({ stage: 'idle', downloadedUri: null, candidate: { versionCode: 302 } });
  });
  it('下载期间合并请求并冻结版本；下载完成才安装', async () => {
    const wait = deferred<string>();
    const d = deps({ download: vi.fn(() => wait.promise) });
    const store = createUpdateStore(d); await store.getState().check();
    const downloading = store.getState().download(); expect(store.getState().download()).toBe(downloading);
    await store.getState().check(true); expect(d.find).toHaveBeenCalledTimes(1); expect(d.install).not.toHaveBeenCalled();
    wait.resolve('downloaded'); await downloading;
    expect(d.install).toHaveBeenCalledWith(candidate(), 'downloaded'); expect(store.getState().stage).toBe('ready');
    await store.getState().install(); expect(d.download).toHaveBeenCalledTimes(1); expect(d.install).toHaveBeenCalledTimes(2);
  });
  it('下载失败不打开安装器', async () => {
    const d = deps({ download: async () => { throw new UpdateError('download'); } });
    const store = createUpdateStore(d); await store.getState().check(); await store.getState().download();
    expect(store.getState().actionError).toBe('download'); expect(d.install).not.toHaveBeenCalled();
  });
  it('取消下载不报错、不安装、不保留路径', async () => {
    const d = deps({ download: (_c, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) });
    const store = createUpdateStore(d); await store.getState().check(); const downloading = store.getState().download(); store.getState().cancel(); await downloading;
    expect(store.getState()).toMatchObject({ stage: 'idle', actionError: null, downloadedUri: null }); expect(d.install).not.toHaveBeenCalled();
  });
  it('安装失败保留已验证文件以便重试/授权', async () => {
    const d = deps({ install: async () => { throw new Error('blocked'); } });
    const store = createUpdateStore(d); await store.getState().check(); await store.getState().download();
    expect(store.getState()).toMatchObject({ stage: 'ready', downloadedUri: 'file:///cache/downloaded.apk', actionError: 'installation' });
    await store.getState().permission(); expect(d.permission).toHaveBeenCalledTimes(1);
  });
  it.each([201, 301, 401])('本机版本码 %s 不允许降级或重复安装', async versionCode => {
    const d = deps({ runtime: { ...deps().runtime, versionCode }, find: async () => candidate(201) });
    const store = createUpdateStore(d); await store.getState().check(); await store.getState().download(); expect(hasUpdate(store.getState())).toBe(false); expect(d.download).not.toHaveBeenCalled();
  });
  it('安装前缓存丢失时回到可重新下载状态', async () => {
    const d = deps({ install: async () => { throw new UpdateError('download'); } });
    const store = createUpdateStore(d); await store.getState().check(); await store.getState().download();
    expect(store.getState()).toMatchObject({ stage: 'idle', downloadedUri: null, actionError: 'download' });
  });
  it('传输实现未及时响应取消时仍然不能进入安装阶段', async () => {
    const wait = deferred<string>(); const d = deps({ download: () => wait.promise });
    const store = createUpdateStore(d); await store.getState().check(); const pending = store.getState().download();
    store.getState().cancel(); wait.resolve('downloaded'); await pending;
    expect(store.getState()).toMatchObject({ stage: 'idle', downloadedUri: null, actionError: null }); expect(d.install).not.toHaveBeenCalled();
  });
  it('开发模式可检测但禁安装；非 Android 不请求 GitHub', async () => {
    const d = deps({ runtime: { ...deps().runtime, development: true } });
    const store = createUpdateStore(d); await store.getState().check(); await store.getState().download(); expect(d.download).not.toHaveBeenCalled();
    const unsupported = deps({ runtime: { ...deps().runtime, supported: false } });
    await createUpdateStore(unsupported).getState().check(); expect(unsupported.find).not.toHaveBeenCalled();
  });
});
