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
src/
  app/                          # Expo Router 入口
    _layout.tsx                 # Splash / i18n / StoreHydration
    index.tsx                   # 渲染 <AppShell/>
  features/                     # 按业务领域切片
    auth/                       # AuthScreen + bootstrap
    connection/                 # WebSocket 状态 + socket-transport
    chat/                       # 聊天主屏（活动会话状态）
    sidebar/                    # 侧边栏会话列表 + 分组
    settings/                   # 设置子屏
    apps/                       # CLI / MCP 应用
    skills/                     # Skills 浏览
    automations/                # 自动化任务
    channels/                   # 渠道运行时
  services/                     # 跨业务基础服务
    api-client.ts               # 统一 API 客户端（fetch + 鉴权 + 超时）
    api.ts                      # apiClient 单例
    auth-credentials.ts         # SecureStore bootstrap secret
    config.ts                   # DEFAULT_SERVER_URL 派生
    bootstrap.ts                # fetchBootstrap / deriveWsUrl
    runtime-capabilities.ts     # host / native 能力策略
    format.ts                   # 时间 / 标题 / 预览
    workspace-paths.ts          # 路径归一化
    user-quote-format.ts        # 引用块格式化
    log-redaction.ts            # 脱敏
    file-diff.ts                # unified diff 解析
    markdown-to-text.ts         # markdown → 可选文本
    provider-brand.ts           # 提供商标识
    web-url.ts                  # Web URL 解析
    media.ts                    # 媒体附件类型归一化
  stores/                       # Zustand 全局 store
    local-preferences-store.ts  # 主题 / 语言 / 密度 / 活动模式
    composer-recents-store.ts   # Composer 历史命令
    theme.ts                    # 主题 → Palette 派生 hook
  ui/                           # 共享 UI 抽象
    palette.ts                  # 唯一 Palette 类型
    colors.ts                   # LIGHT / DARK 颜色取值
  i18n/                         # i18next + react-i18next
    config.ts                   # supportedLocales / normalize
    index.ts                    # ensureI18n() 显式初始化
    locales/                    # 10 种语言 common.json
  hooks/                        # 跨特性 hook
    use-nanobot-app.ts          # 顶层 store-backed 编排 hook
  types/
    api.ts                      # wire-format 类型（InboundEvent / OutboundFrame / BootstrapResponse）
    domain.ts                   # UI 派生类型（Palette / AppTheme）
  components/                   # 屏幕级组件
    auth-screen.tsx
    sidebar-drawer.tsx
    nanobot-screen.tsx
    settings/                   # 9 个 settings 子屏
```

## 架构关键决策

- **Zustand 切片 store**：跨组件状态分布在 `auth` / `connection` / `chat` / `sidebar` / `capabilities` / `settings` / `workspaces` / `local-preferences` / `composer-recents` 9 个独立 store 中，按域切片，单一来源。
- **apiClient 单例**：`@/services/api-client.ts` 提供统一的 fetch + 鉴权 + 超时 + JSON 错误翻译；所有 endpoint 通过 `apiClient.get/post/request` 调用，不再传递 `baseUrl`/`token`。
- **Socket 收敛为 transport**：`@/features/connection/socket-transport.ts` 只负责 WebSocket 协议 + 帧队列 + 入站分发；run generation / canonical reconciliation 等业务语义迁移到 `chat/store.ts`。
- **唯一 Palette**：`@/ui/palette.ts` 合并了原本散落在 7 个文件中的重复类型。
- **i18n 显式初始化**：`@/i18n/index.ts` 顶层不再有副作用，调用方需 `await ensureI18n()`。
- **Vitest 单测**：覆盖所有纯模块基线（api-client / chat-groups / stream-fold / format / log-redaction / file-diff / user-quote-format / workspace-paths），共 47 个测试。

不要为了预设目录而创建空文件，目录应随业务代码一起增加。

## Android 包名

当前开发包名为 `com.anonymous.nanobotclient`。正式发布前应确定永久包名，并更新 `app.json` 中的 `expo.android.package`；修改包名后需要重新构建和安装开发版。
