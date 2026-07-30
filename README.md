# nanobot-client

基于 Expo SDK 57、React Native 和 Expo Router 的 nanobot 移动客户端。

项目使用 `expo-dev-client` 和本地原生构建，不依赖商店版 Expo Go，也不要求使用 EAS 云端构建。

## 环境要求

- Node.js
- npm
- JDK 17
- Android SDK Platform 36
- Android SDK Build-Tools 36.0.0
- Android Platform-Tools（ADB）

本机需要配置：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

## 安装依赖

```bash
npm ci
```

## Android 本地开发

连接并授权 Android 真机：

```bash
adb devices -l
```

首次构建或原生依赖、原生配置发生变化时：

```bash
npm run android
```

该命令会运行 Expo Prebuild、使用本机 Gradle 编译开发版 APK，并将应用安装到已连接的设备。
生成的 `android/` 和 `ios/` 目录由 Expo Prebuild 管理，不提交到 Git。

开发版已经安装且只修改 TypeScript、React 组件或样式时：

```bash
npm start
```

## Web 开发

```bash
npm run web
```

## 代码检查

提交代码前运行：

```bash
npm run check
```

也可以分别运行：

```bash
npm run lint
npm run typecheck
npx expo-doctor
```

## 目录结构

```text
src/app/          Expo Router 页面和布局
src/components/   通用 UI 组件
src/constants/    主题等常量
src/hooks/        通用 React Hooks
src/types/        项目类型声明
assets/           图标、启动图和静态资源
```

## Android 包名

当前开发包名为 `com.anonymous.nanobotclient`。正式发布前应确定永久包名，并更新 `app.json` 中的 `expo.android.package`；修改包名后需要重新构建和安装开发版。
