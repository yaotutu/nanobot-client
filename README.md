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

## 本地构建并发布 GitHub Release

`npm run release` 会构建 Android Release APK 并创建对应的 GitHub Release（含 SHA-256 校验文件）。
它只处理 Android，不导出 Web；也不检查、提交或推送 Git 工作区——APK 直接来自当前本地工作区。

首次使用前登录 GitHub CLI：

```bash
gh auth login
```

日常直接运行（默认自动将 patch 版本号加一，并同步 `package.json` / `app.json` / `package-lock.json`）：

```bash
npm run release
```

常用选项：

```bash
npm run release -- minor           # 1.0.5 -> 1.1.0
npm run release -- v1.2.0          # 使用指定版本号
npm run release -- --no-version    # 不修改版本号
npm run release -- --local-only    # 只构建 APK，不创建 GitHub Release
npm run release -- --clean-native  # 重新生成 Android 原生工程
```

产物保存在 `release-assets/vX.Y.Z/`（已在 `.gitignore` 中）。完整的打包、发布、缓存与清理说明见
[`docs/android-release.md`](docs/android-release.md)。

> 当前 Android Release 使用开发签名，适合通过 GitHub Release 侧载安装；若要提交应用商店，
> 应先配置并安全保管正式签名密钥。

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
src/
├── app/           Expo Router 路由与根布局
├── components/    根错误边界、DebugOverlay 等应用外壳组件
├── features/      按业务域切片（app、auth、chat、connection、settings 等）
├── hooks/         少量真正跨 feature 的通用 hook
├── i18n/          i18next 配置与 10 种语言资源
├── services/      跨业务基础服务（api、credentials、links、runtime、text）
├── stores/        跨业务本地偏好和 composer 历史 store
├── types/         公共 API / wire-format 类型
└── ui/            Palette、颜色和低业务耦合 UI 原语

assets/            图标、启动图等静态资源
plugins/           Expo config plugin
scripts/           发布、bundle smoke 和真机恢复验证脚本
docs/              架构、发布和验证文档
```

业务依赖方向为：

```text
src/app -> src/features/app -> src/features/<feature>/index.ts
        -> src/services + src/types + src/ui
```

详细的模块边界、认证代次、连接恢复和 WebSocket 拆分说明见
[`docs/architecture.md`](docs/architecture.md)。

## 架构关键决策

- **Feature 公共入口**：跨 feature 只能通过 `src/features/<feature>/index.ts` 导入，ESLint 会阻止深层跨域依赖。
- **应用编排层**：业务路由只渲染 `@/features/app`；`features/app` 负责组合各业务域和应用级生命周期。
- **独立 Zustand store**：auth、connection、chat、sidebar、capabilities、settings、workspaces 等按域维护单一状态来源。
- **认证双代次**：`sessionEpoch` 表示身份会话变化，`tokenGeneration` 表示 token 签发变化，静默续期不会触发全部业务状态重置。
- **连接恢复分层**：NetInfo/AppState 恢复原因由应用层记录；transport 只负责刷新一次性凭据、替换 socket、队列和 pending request 生命周期。
- **Socket 职责拆分**：protocol、commands、inbound router、listeners、pending registry、outbound queue 和 reconnect policy 均为独立模块。
- **API 类型窄入口**：chat/settings 新代码从领域文件导入，同时保留聚合文件作为兼容入口。
- **纯模型优先测试**：stream-fold、媒体去重、文件路径压缩和工具展示等纯逻辑从组件中提取后由 Vitest 覆盖。

`npm run check` 会执行 lint、typecheck、Vitest、Native Jest 和 Android Metro bundle smoke。
涉及锁屏、前后台或断网恢复时，还应连接真机运行：

```bash
npm run verify:android:recovery
```

不要为了预设目录而创建空文件，目录应随业务代码一起增加。

## Android 包名

当前开发包名为 `com.anonymous.nanobotclient`。正式发布前应确定永久包名，并更新 `app.json` 中的 `expo.android.package`；修改包名后需要重新构建和安装开发版。
