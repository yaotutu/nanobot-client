# nanobot-client

nanobot 移动客户端，基于 **Expo SDK 57** + **React Native 0.86** + **Expo Router**。
后端是 `/Users/yaotutu/Desktop/code/nanobot`（Python Agent 网关）。本仓库只负责 Android/iOS/Web 客户端 UI。

## Expo 版本提示（重要）

> **Expo HAS CHANGED — Read the versioned docs before writing code:**
> https://docs.expo.dev/versions/v57.0.0/

不要依赖记忆中的 Expo 旧 API。SDK 57 调整了 `expo-audio`、`expo-video`、`expo-file-system`、`expo-router` 等多个包的接口，所有调用前请查阅版本化文档。

## 开发环境

- Node.js（npm）
- JDK 17（Android 原生构建需要）
- Android SDK Platform 36 + Build-Tools 36.0.0 + Platform-Tools（ADB）
- 真机或 Android 模拟器

环境变量（macOS）：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

## 常用脚本

```bash
npm ci                     # 安装依赖（提交后第一次必跑）
npm run check              # lint + typecheck（提交前必跑）
npm run lint               # 仅 ESLint
npm run typecheck          # 仅 tsc --noEmit

npm start                  # Metro dev server（基于 expo-dev-client）
npm run android            # expo run:android（含 prebuild + Gradle 构建 + 安装）
npm run ios                # expo run:ios
npm run web                # 启动 Web 开发服务（发布脚本不导出 Web）

npm run release              # 使用现有依赖，构建并发布 Android Release APK
```

Android Release 打包与 GitHub Release 发布的完整说明见 [`docs/android-release.md`](docs/android-release.md)。

辅助检查：

```bash
npx expo-doctor
npm audit --audit-level=low
```

## 目录结构

```
src/
├── app/           Expo Router 路由（_layout.tsx、index.tsx 等）
├── components/    UI 组件（screen、modal、overlay 等）
├── features/      按业务领域切片（auth、chat、settings、sidebar 等）
├── hooks/         自定义 React hooks
├── i18n/          i18next 配置 + locales/*.json
├── services/      跨业务基础服务（api/、credentials/、text/、links/、runtime/）
├── stores/        Zustand 全局 store
├── types/         公共类型声明
└── ui/            共享 UI 抽象（palette、colors）

assets/            图标、启动图等静态资源
plugins/           Expo config plugin（with-nanobot-network-security 等）
android/ ios/      Expo Prebuild 产物（已 git ignore）
```

`src/features/`、`src/stores/` 等业务目录已启用；`src/services/` 按职责分组（`api/`、`credentials/`、`text/`、`links/`、`runtime/`），新增文件先归入对应分组，避免在根目录平铺。

## 路由与启动流程

- `app.json` → `expo-router/entry`
- 根布局：`src/app/_layout.tsx`
  - `SafeAreaProvider` → `RootErrorBoundary` → `LocalizationGate`（异步读取本地偏好 + 设置 i18n 语言）→ `<Stack screenOptions={{ headerShown: false }} />`
  - 通过 `SplashScreen.preventAutoHideAsync()` / `hideAsync()` 显式控制启动屏
  - 注册了 `ErrorUtils.setGlobalHandler` 捕获未处理错误，写入 DebugOverlay
- 单页入口：`src/app/index.tsx`（其余路由按需在 `src/app/` 下新增）

## 关键模块

- `src/services/api/api.ts` + `api-client.ts` — REST 客户端（apiClient 单例 + fetch/鉴权/超时）
- `src/features/connection/socket-transport.ts` — 与网关的 WebSocket / 流式协议
- `src/stores/local-preferences-store.ts` — `expo-secure-store` 持久化的本地偏好
- `src/services/api/bootstrap.ts`、`src/services/credentials/local-dev-bootstrap.ts` — 启动期开发者模式装配
- `src/services/runtime/debug-log.ts` + `src/components/debug-overlay.tsx` — 调试日志（release 构建中 `console.*` 会被剥离，UI overlay 是唯一可视通道）
- `src/i18n/` — i18next + react-i18next，支持 `en/es/fr/id/ja/ko/pt-BR/vi/zh-CN/zh-TW`
- `src/services/api/config.ts` — 网关地址解析（`EXPO_PUBLIC_NANOBOT_SERVER_URL` → ADB reverse tunnel → 默认局域网地址）

## 编码约定

- TypeScript strict；`tsconfig.json` 中定义了 `@/*` → `src/*`、`@/assets/*` → `assets/*` 的路径别名。
- ESLint：flat config（`eslint.config.mjs`），启用 `@typescript-eslint` 推荐规则 + `eslint-plugin-react-hooks`。`android/`、`dist/`、`ios/` 被忽略。
- 入口样式调色板以 `#FAFAF9` / `#208AEF` 为基础，遵循 `app.json` 中的 `userInterfaceStyle: automatic`。
- i18n：所有面向用户文本必须走 i18next；新增 key 时同步更新所有 `src/i18n/locales/*/common.json`。
- 不要提交 `android/`、`ios/`、`dist/`、`expo-env.d.ts`、`src/services/credentials/dev-secret.ts`（参见 `.gitignore`）。
- 修改包名 / 原生配置后必须重新 `npm run android`，仅 `npm start` 不会反映原生变更。

## 本地开发技巧

- 真机连接：`adb devices -l`，首次或原生改动后用 `npm run android` 构建安装；纯 TS / 样式改动 `npm start` 即可。
- USB 连接 Android 想用主机网关：`adb reverse tcp:8765 tcp:8765`，`src/services/api/config.ts` 会自动使用 `localhost:8765`。
- 自定义网关地址：构建时设置 `EXPO_PUBLIC_NANOBOT_SERVER_URL`。
- `package.json` 的 `overrides.xcode.uuid` 用于压制 SDK 57 工具链的间接依赖告警；升级 Expo 后重新审计，若上游已修复可移除。

## 提交流程

1. `npm run check`（必过）
2. `npx expo-doctor`（建议）
3. 写清楚改了什么、为什么；UI 截图 / 设备日志写到 `.local/verification-raw/`（默认 git ignore），清洗后提交到 `docs/verification/<kind>-<date>/`。
4. 不要把原生构建产物（`android/`、`ios/`）提交。

## 相关链接

- nanobot 服务端：`/Users/yaotutu/Desktop/code/nanobot/AGENTS.md`
- Expo SDK 57：https://docs.expo.dev/versions/v57.0.0/
- React Native 0.86：https://reactnative.dev/blog
