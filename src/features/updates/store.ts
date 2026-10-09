import { createStore } from 'zustand/vanilla';
import { CHECK_INTERVAL, UpdateError, type UpdateCandidate, type UpdateErrorCode, type UpdateRuntime } from './model';

export interface UpdateDependencies {
  runtime: UpdateRuntime;
  now: () => number;
  find: () => Promise<UpdateCandidate | null>;
  download: (candidate: UpdateCandidate, signal: AbortSignal, onProgress: (bytes: number) => void) => Promise<string>;
  install: (candidate: UpdateCandidate, uri: string) => Promise<void>;
  permission: () => Promise<void>;
}
export interface UpdateState {
  runtime: UpdateRuntime;
  candidate: UpdateCandidate | null;
  lastCheckedAt: number | null;
  checkStatus: 'idle' | 'checking' | 'checked' | 'error';
  checkError: UpdateErrorCode | null;
  actionError: UpdateErrorCode | null;
  stage: 'idle' | 'downloading' | 'ready' | 'installing';
  downloadedBytes: number;
  downloadedUri: string | null;
  check: (manual?: boolean) => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  permission: () => Promise<void>;
  cancel: () => void;
}
export const hasUpdate = (state: Pick<UpdateState, 'candidate' | 'runtime'>) =>
  Boolean(state.candidate && state.candidate.versionCode > state.runtime.versionCode);
export const updateBusy = (state: Pick<UpdateState, 'stage'>) => ['downloading', 'installing'].includes(state.stage);
const errorCode = (error: unknown, fallback: UpdateErrorCode) => error instanceof UpdateError ? error.code : fallback;

/** 操作属于应用级 store，不随设置弹窗卸载。关闭页面不会取消下载；只有用户发起“下载并安装”才会在校验后打开安装器。 */
export function createUpdateStore(deps: UpdateDependencies) {
  let checking: Promise<void> | null = null;
  let downloading: Promise<void> | null = null;
  let abort: AbortController | null = null;
  let retryAt = 0;
  let lastAttemptAt: number | null = null;
  return createStore<UpdateState>((set, get) => ({
    runtime: deps.runtime, candidate: null, lastCheckedAt: null, checkStatus: 'idle', checkError: null,
    actionError: null, stage: 'idle', downloadedBytes: 0, downloadedUri: null,
    // 只保存本进程的检查状态；重启重新读取 Latest。手动检查可绕过固定间隔，但不能绕过明确限流。
    check: (manual = false) => {
      if (checking) return checking;
      // 延迟到微任务执行，使同步抛错、跳过检查也能可靠释放合并请求。
      checking = Promise.resolve().then(async () => {
        const state = get();
        if (!deps.runtime.supported || updateBusy(state) || deps.now() < retryAt
          || (!manual && lastAttemptAt !== null && deps.now() - lastAttemptAt < CHECK_INTERVAL)) return;
        lastAttemptAt = deps.now();
        set({ checkStatus: 'checking', checkError: null });
        try {
          const candidate = await deps.find();
          const lastCheckedAt = deps.now();
          // 版本切换时废弃旧安装路径；文件按整数版本码缓存，下次下载可复用。
          const changed = candidate?.apkUrl !== get().candidate?.apkUrl || candidate?.versionCode !== get().candidate?.versionCode;
          set({ candidate, lastCheckedAt, checkStatus: 'checked', checkError: null,
            ...(changed ? { stage: 'idle', downloadedUri: null, downloadedBytes: 0, actionError: null } as const : {}) });
          retryAt = 0;
        } catch (error) {
          retryAt = error instanceof UpdateError && error.code === 'rateLimit'
            ? Math.max(error.retryAt, deps.now() + 60000) : 0;
          set({ checkStatus: 'error', checkError: errorCode(error, 'network') }); // 保留已有更新提示，不伪装成“无更新”。
        }
      }).finally(() => { checking = null; });
      return checking;
    },
    download: () => {
      if (downloading) return downloading;
      const state = get();
      if (!hasUpdate(state) || !state.candidate || !deps.runtime.supported || deps.runtime.development || updateBusy(state) || state.checkStatus === 'checking') return Promise.resolve();
      const candidate = state.candidate;
      abort = new AbortController();
      const signal = abort.signal;
      set({ stage: 'downloading', actionError: null, downloadedBytes: 0, downloadedUri: null });
      downloading = (async () => {
        try {
          const uri = await deps.download(candidate, signal, (bytes) => {
            if (!signal.aborted) set({ downloadedBytes: bytes, stage: 'downloading' });
          });
          if (signal.aborted) throw new Error('cancelled');
          set({ downloadedUri: uri, stage: 'ready' });
          // 只有用户点“下载并安装”才在下载后启动安装；启动检查永不下载或打断聊天。
          await get().install();
        } catch (error) {
          set({ stage: 'idle', downloadedUri: null, actionError: signal.aborted ? null : errorCode(error, 'download') });
        }
      })().finally(() => { downloading = null; abort = null; });
      return downloading;
    },
    install: async () => {
      const { candidate, downloadedUri, stage } = get();
      if (!candidate || !downloadedUri || stage !== 'ready' || deps.runtime.development) return;
      set({ stage: 'installing', actionError: null });
      try { await deps.install(candidate, downloadedUri); }
      catch (error) {
        const code = errorCode(error, 'installation');
        set({ actionError: code, ...(code === 'download' ? { downloadedUri: null, stage: 'idle' } as const : {}) });
      }
      finally { if (get().stage === 'installing') set({ stage: 'ready' }); } // 安装器返回不代表安装成功；下次启动读取原生版本码。
    },
    permission: async () => {
      if (!deps.runtime.supported || deps.runtime.development) return;
      try { await deps.permission(); } catch { set({ actionError: 'installation' }); }
    },
    cancel: () => { abort?.abort(); },
  }));
}
