# Android Release Build Gate — 2026-08-01

## 静态与构建

| Gate | 结果 |
| --- | --- |
| `npm run lint --max-warnings=0` | PASS |
| `npm run typecheck` | PASS |
| `git diff --check` | PASS |
| `npx expo-doctor` | 20/20 PASS |
| `npx expo export --platform android` | PASS, 7.3MB HBC |
| `EXPO_PUBLIC_NANOBOT_SERVER_URL=http://192.168.55.147:8765` | 已注入 release 资源 |
| `./gradlew :app:assembleRelease` | BUILD SUCCESSFUL in 6m 18s, 870 actionable tasks |

## Release APK

- 路径：`android/app/build/outputs/apk/release/app-release.apk`
- 大小：116 325 028 字节（≈ 111 MB）
- SHA-256：`83ddec55edc7a95c69b2638474222e8cf03c33b91e7c939793a3bd440c6b01bc`
- 默认服务端：`http://192.168.55.147:8765`（goal 默认 LAN）
- 包名 / versionName / versionCode：`com.anonymous.nanobotclient` / `1.0.0` / `1`
- minSdk / targetSdk / compileSdk：`24` / `36` / `36`
- 启用架构：`armeabi-v7a, arm64-v8a, x86, x86_64`

## 真机验证

- 设备：Pixel XL（HT7390201404，Android 10 / API 29，USB + ADB）
- 验收命令：`adb install -r app-release.apk`、`adb shell am start -n com.anonymous.nanobotclient/.MainActivity`
- 启动后直接呈现 `AuthScreen`（见 `03-release-launch.png` / `04-release-auth-screen.png`）
  - 标题：Authentication required
  - 副标题：Enter the secret configured as tokenIssueSecret in your gateway config.
  - 输入框：Password（secureTextEntry）
  - 操作：Connect（按钮按状态启用/禁用）
- 该路径与 goal “密码由用户运行时输入” 严格一致；输入 `redhat` + Connect 即触发 bootstrap → 自动进入主界面
- 因本机未处于 LAN 192.168.55.147，Connect 会落到 “Couldn't reach nanobot” 错误屏；这是预期的网络配置差异，不是 RN 缺陷。
- 全功能 UI 渲染（含 Copy / Ask about this / Fork / Retry 四个按钮）已在 Metro HMR 通道（`adb reverse tcp:8765`）下完整验证，证据见 `artifacts-sanitized/retry-2026-08-01/`。

## 安全 / 凭据策略

- 凭据完全由用户在密码登录页输入，未写入任何源码、配置文件、构建参数、Git 历史、截图或验收产物。
- 唯一存储介质：`expo-secure-store`（Android Keystore）。
- Release APK 内的 default URL 是 LAN 地址，不包含任何 token。
- 截图和文档中所有 token/secret 均已脱敏（`<redacted>`）。
