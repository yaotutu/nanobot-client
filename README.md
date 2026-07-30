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
npm audit --audit-level=low
```

`package.json` 中对 `xcode` 的 `uuid` 依赖做了定向覆盖，用于修复 Expo SDK 57
工具链中的间接依赖告警，同时保持 Expo 57 不降级。升级 Expo 后应重新运行完整审计，
如果上游已经更新该依赖即可移除覆盖。

## 目录结构

```text
src/app/          Expo Router 路由页面和根布局
assets/           应用图标、启动图和静态资源
```

当前项目仅保留可运行的最小页面骨架。开始开发业务后，可按实际需要新增：

```text
src/components/   跨业务复用的 UI 组件
src/features/     按业务领域组织的功能模块
src/services/     API、存储等基础服务
src/store/        全局状态
src/types/        公共类型声明
src/utils/        无业务状态的工具函数
```

不要为了预设目录而创建空文件，目录应随业务代码一起增加。

## Android 包名

当前开发包名为 `com.anonymous.nanobotclient`。正式发布前应确定永久包名，并更新 `app.json` 中的 `expo.android.package`；修改包名后需要重新构建和安装开发版。
