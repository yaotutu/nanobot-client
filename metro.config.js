const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultGetTransformOptions = config.transformer.getTransformOptions;

/**
 * 保留 Expo SDK 57 默认 transformer 选项，只开启 Metro 的 inlineRequires。
 * 这样非首屏模块会在第一次真正访问时再执行，减少旧 Android 设备冷启动阶段的同步 JS 工作量。
 */
config.transformer.getTransformOptions = async (...args) => {
  const options = await defaultGetTransformOptions(...args);
  return {
    ...options,
    transform: {
      ...options.transform,
      inlineRequires: true,
    },
  };
};

module.exports = config;
