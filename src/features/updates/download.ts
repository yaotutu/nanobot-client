import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { UPDATE_PACKAGE, UpdateError, type UpdateCandidate } from './model';

const updateDirectory = () => {
  const directory = new Directory(Paths.cache, 'app-updates');
  directory.create({ idempotent: true, intermediates: true });
  return directory;
};
const ensureNotCancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new Error('cancelled'); };
const updateFileName = (candidate: UpdateCandidate) => candidate.versionCode + '.apk';

export async function downloadUpdate(candidate: UpdateCandidate, signal: AbortSignal, progress: (bytes: number) => void) {
  const directory = updateDirectory();
  const file = new File(directory, updateFileName(candidate));
  const partial = new File(directory, updateFileName(candidate) + '.partial');
  // 下载已串行化，只保留当前版本缓存，防止连续开发构建挤满应用磁盘。
  if (file.exists) return file.uri;
  for (const old of directory.list()) if (old instanceof File) old.delete();
  if (Paths.availableDiskSpace < candidate.size + 20 * 1024 * 1024) throw new UpdateError('storage');
  try {
    ensureNotCancelled(signal);
    await File.downloadFileAsync(candidate.apkUrl, partial, {
      idempotent: true, signal,
      onProgress: event => progress(event.bytesWritten),
    });
    ensureNotCancelled(signal);
    // 下载器成功返回即视为下载完成；不做哈希校验，直接交给系统安装器处理 APK 结构与签名。
    if (!partial.exists) throw new UpdateError('download');
    await partial.move(file);
    return file.uri;
  } catch (error) {
    if (partial.exists) partial.delete(); // Android 中断下载会留下部分文件，绝不作为安装来源。
    throw error;
  }
}

export async function installUpdate(candidate: UpdateCandidate, uri: string) {
  const file = new File(uri);
  // 只允许打开应用私有更新缓存中的本次下载文件；缓存丢失时回到重新下载状态。
  const expectedUri = new File(updateDirectory(), updateFileName(candidate)).uri;
  if (uri !== expectedUri) throw new UpdateError('installation');
  if (!file.exists) throw new UpdateError('download');
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri, type: 'application/vnd.android.package-archive', flags: 1,
  });
}
export async function openInstallPermission() {
  await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', { data: 'package:' + UPDATE_PACKAGE });
}
