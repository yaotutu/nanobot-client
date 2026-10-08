import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { UPDATE_PACKAGE, UpdateError, type UpdateCandidate } from './model';

const updateDirectory = () => {
  const directory = new Directory(Paths.cache, 'app-updates');
  directory.create({ idempotent: true, intermediates: true });
  return directory;
};
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const ensureNotCancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new Error('cancelled'); };

/** APK 可超过 100MB：分块计算 SHA-256，禁止整文件 base64/arrayBuffer 占满 JS 堆。 */
async function verify(file: File, candidate: UpdateCandidate, signal?: AbortSignal) {
  if (!file.exists || file.size !== candidate.size) throw new UpdateError('integrity');
  const hash = sha256.create();
  const handle = file.open();
  try {
    while ((handle.offset ?? 0) < candidate.size) {
      ensureNotCancelled(signal);
      const bytes = handle.readBytes(Math.min(1024 * 1024, candidate.size - (handle.offset ?? 0)));
      if (!bytes.length) throw new UpdateError('integrity');
      hash.update(bytes);
      await pause(); // 让进度/取消交互能在校验过程中及时响应。
    }
    if (bytesToHex(hash.digest()) !== candidate.sha256) throw new UpdateError('integrity');
  } finally { handle.close(); hash.destroy(); }
}

export async function downloadUpdate(candidate: UpdateCandidate, signal: AbortSignal, progress: (bytes: number, verifying?: boolean) => void) {
  const directory = updateDirectory();
  const file = new File(directory, candidate.sha256 + '.apk');
  const partial = new File(directory, candidate.sha256 + '.partial');
  if (file.exists) {
    progress(file.size, true);
    try { await verify(file, candidate, signal); return file.uri; }
    catch (error) { if (signal.aborted) throw error; file.delete(); }
  }
  // 下载已串行化，只保留当前版本缓存，防止连续开发构建挤满应用磁盘。
  for (const old of directory.list()) if (old instanceof File) old.delete();
  if (Paths.availableDiskSpace < candidate.size + 20 * 1024 * 1024) throw new UpdateError('storage');
  try {
    ensureNotCancelled(signal);
    await File.downloadFileAsync(candidate.apkUrl, partial, {
      idempotent: true, signal,
      onProgress: event => progress(event.bytesWritten),
    });
    ensureNotCancelled(signal);
    progress(partial.size, true);
    await verify(partial, candidate, signal);
    ensureNotCancelled(signal);
    await partial.move(file);
    return file.uri;
  } catch (error) {
    if (partial.exists) partial.delete(); // Android 中断下载会留下部分文件，绝不作为安装来源。
    throw error;
  }
}

export async function installUpdate(candidate: UpdateCandidate, uri: string) {
  const file = new File(uri);
  // 缓存可能被系统清理/修改，每次启动安装器前重新验证，且仅允许私有缓存中的已知 SHA 路径。
  if (uri !== new File(updateDirectory(), candidate.sha256 + '.apk').uri) throw new UpdateError('integrity');
  await verify(file, candidate);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri, type: 'application/vnd.android.package-archive', flags: 1,
  });
}
export async function openInstallPermission() {
  await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', { data: 'package:' + UPDATE_PACKAGE });
}
