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
npm run check              # lint + typecheck + 单元/Native 测试 + Android bundle smoke（提交前必跑）
npm run lint               # 仅 ESLint
npm run typecheck          # 仅 tsc --noEmit

npm start                  # Metro dev server（基于 expo-dev-client）
npm run android            # expo run:android（含 prebuild + Gradle 构建 + 安装）
npm run ios                # expo run:ios
npm run web                # 启动 Web 开发服务（发布脚本不导出 Web）

npm run release              # 使用现有依赖，构建并发布 Android Release APK
```

GitHub Actions：`.github/workflows/android-development-release.yml` 监听 `main` 推送，完整检查后发布 Android 开发用途 Latest Release（非 prerelease）；云端临时版本不回写仓库。

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

## UI 策略

- Android、iOS 和 Web 共用同一套 React Native UI；只按窗口尺寸做响应式布局，不用 `Platform.OS` / `Platform.select` 拆分组件、样式或交互。
- 平台判断只允许出现在能力开关或原生能力封装中（例如 Android APK 安装），不得扩散到业务 UI。

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
- `src/services/api/config.ts` — 网关地址解析（`EXPO_PUBLIC_NANOBOT_SERVER_URL` → `http://192.168.55.201:8765`，不自动切换 ADB 地址）

### 聊天精简后的功能边界

- `features/settings` 包含本地主题／语言／应用更新／退出弹窗；不要恢复服务端管理面板。
- `features/capabilities`、`features/skills` 只保留聊天所需的只读目录，不含 Apps／Skills 页面。
- 模型目录读取在 `features/chat/api/model-catalog.ts`，不提供 Provider／模型配置写接口。
- 不发送级联删除自动任务参数；服务端拒绝删除时保留会话并显示提示。
- 已移除录音、日期选择和渠道二维码依赖；不要误删聊天附件／视频展示。

### 消息页结构

- `NanobotScreen` 组装控制器、键盘避让、连接状态与弹窗；`ChatHeader` 展示 nanobot 品牌形象、副标题与会话胶囊，左上角打开左侧会话抽屉，保留提示导航操作；右上角打开当前会话的聊天选项，新建会话入口保留在会话抽屉。
- `ConversationSheet` 从左侧滑入（宽屏仅限制抽屉宽度），沿用 nanobot 会话分组与操作；列表独立滚动，返回键优先关闭操作／重命名子层，再关闭抽屉。全局设置与连接状态固定在抽屉底部；右上角聊天选项只管理当前会话。抽屉开关不重置聊天草稿。
- `ChatSurface` 切换空会话／加载／消息列表的内容区域，底部 composer 始终只挂载一次，避免首条消息发送时丢失输入焦点。
- `ComposerInputRow` 只负责附件、输入和发送／停止；主界面不显示配置底栏。顶栏右上角「聊天选项」打开 `ChatOptionsModal`，模型、工作区和权限共用一个弹窗，列表／路径表单在弹窗内展开；已有会话的工作区只读，工作区错误在弹窗内外均可见。
- `fetchThread` 仅接收 `schemaVersion: 3 / projection: events`，经 `model/thread-events.ts` 回放成领域消息；不接受旧 `messages` 线上快照。
- 历史回放与实时消息共用 `stream-fold`；`model/thread-messages.ts` 统一过滤控制命令与计算展示时间，不包含历史文本兼容清洗。

### 应用内更新

- `features/updates` 只读取公开 GitHub Latest Release 的一份平铺 `update.json`，不调用 nanobot 更新接口。
- 只支持 Android Release APK 安装，Metro 开发模式禁安装；原生权限/依赖变更需重新构建。
- 固定现有包名和开发签名；发布版本码按基数 + GitHub run number 递增，仅按整数 versionCode 比较；不遍历 Release，不兼容旧清单或旧更新缓存。
- 完整发布约定见 `docs/in-app-updates.md` 与 `docs/android-release.md`。

## 编码约定

- TypeScript strict；`tsconfig.json` 中定义了 `@/*` → `src/*`、`@/assets/*` → `assets/*` 的路径别名。
- ESLint：flat config（`eslint.config.mjs`），启用 `@typescript-eslint` 推荐规则 + `eslint-plugin-react-hooks`。`android/`、`dist/`、`ios/` 被忽略。
- 认证／设置沿用共享调色板；聊天页与会话面板使用 `src/features/chat/ui/chat-theme.ts` 独立定义的浅色／深色调色板。不要把旧聊天密度、活动模式、代码换行等显示偏好加回来。
- i18n：所有面向用户文本必须走 i18next；新增 key 时同步更新所有 `src/i18n/locales/*/common.json`。
- 不要提交 `android/`、`ios/`、`dist/`、`expo-env.d.ts`、`src/services/credentials/dev-secret.ts`（参见 `.gitignore`）。
- 修改包名 / 原生配置后必须重新 `npm run android`，仅 `npm start` 不会反映原生变更。

## 本地开发技巧

- 真机连接：`adb devices -l`，首次或原生改动后用 `npm run android` 构建安装；纯 TS / 样式改动 `npm start` 即可。
- USB 连接 Android 想用主机网关：先执行 `adb reverse tcp:8765 tcp:8765`，再显式设置 `EXPO_PUBLIC_NANOBOT_SERVER_URL=http://localhost:8765`；默认仍连接指定局域网地址。
- 自定义网关地址：构建时设置 `EXPO_PUBLIC_NANOBOT_SERVER_URL`。
- `package.json` 的 `overrides.xcode.uuid` 用于压制 SDK 57 工具链的间接依赖告警；升级 Expo 后重新审计，若上游已修复可移除。

## 提交流程

1. `npm run check`（必过）
2. `npx expo-doctor`（建议）
3. 写清楚改了什么、为什么；UI 截图 / 设备日志写到 `.local/verification-raw/`（默认 git ignore），清洗后提交到 `docs/verification/<kind>-<date>/`。
4. 不要把原生构建产物（`android/`、`ios/`）提交。
5. 用户要求“提交代码”时，提交成功后必须自动执行 `git push` 到当前跟踪分支；不要只停留在本地提交。`main` 分支推送后由 GitHub Actions 自动执行云端构建和发布，除非用户当次明确要求“只提交、不推送”。

## 相关链接

- nanobot 服务端：`/Users/yaotutu/Desktop/code/nanobot/AGENTS.md`
- Expo SDK 57：https://docs.expo.dev/versions/v57.0.0/
- React Native 0.86：https://reactnative.dev/blog
