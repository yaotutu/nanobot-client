import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { findUpdate } from './release-api';
import { createUpdateStore } from './store';
import { UPDATE_PACKAGE } from './model';

const runtime = {
  version: Application.nativeApplicationVersion,
  versionCode: Number(Application.nativeBuildVersion) || 0,
  supported: Platform.OS === 'android' && Application.applicationId === UPDATE_PACKAGE,
  development: __DEV__,
};
export const updateStore = createUpdateStore({
  runtime, now: Date.now,
  find: findUpdate,
  // 哈希、文件传输和 Intent 只在用户操作时加载，不让更新功能拖慢聊天首帧。
  download: async (...args) => (await import('./download')).downloadUpdate(...args),
  install: async (...args) => (await import('./download')).installUpdate(...args),
  permission: async () => (await import('./download')).openInstallPermission(),
});
