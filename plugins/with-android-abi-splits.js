const { createRunOncePlugin, withAppBuildGradle } = require('expo/config-plugins');

// Gradle ABI split 配置只在显式传入 nanobot.enableAbiSplits=true 时启用。
// 这样日常 Debug 构建仍保持通用行为，Release 脚本可以要求拆分包和通用包一起产出。
const ABI_SPLIT_BLOCK = `

    // nanobot Release 产物按 CPU 架构拆分，同时保留 universal 包作为兜底。
    if ((findProperty('nanobot.enableAbiSplits') ?: 'false').toBoolean()) {
        splits {
            abi {
                enable true
                reset()
                include 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'
                universalApk true
            }
        }
    }
`;

/**
 * 将 ABI split 配置注入 Expo prebuild 生成的 android/app/build.gradle。
 * android/ 是生成产物且不入库，所以这里必须通过 config plugin 持久化配置。
 */
function withAndroidAbiSplits(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    const contents = gradleConfig.modResults.contents;
    if (contents.includes('nanobot.enableAbiSplits')) return gradleConfig;

    const marker = 'android {';
    const index = contents.indexOf(marker);
    if (index < 0) throw new Error('android/app/build.gradle 缺少 android {} 配置块。');

    gradleConfig.modResults.contents =
      contents.slice(0, index + marker.length) + ABI_SPLIT_BLOCK + contents.slice(index + marker.length);
    return gradleConfig;
  });
}

// Expo prebuild 可能多次应用 app.json 插件；用官方 run-once 包装避免重复插入 Gradle 配置。
module.exports = createRunOncePlugin(withAndroidAbiSplits, 'nanobot-with-android-abi-splits', '1.0.0');
