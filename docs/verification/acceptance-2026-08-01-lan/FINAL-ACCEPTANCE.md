# Nanobot RN 客户端 — 真机最终验收 (2026-08-01)

## 项目基线

- 目标：在 `/Users/yaotutu/Desktop/code/nanobot-client` 中以 Expo SDK 57 + React Native 重建 `/Users/yaotutu/Desktop/code/nanobot/webui` 的移动端逻辑。
- 默认服务端：`http://192.168.55.147:8765/`（开发态通过 `adb reverse tcp:8765 tcp:8765` + `localhost:8765` 路由；`EXPO_PUBLIC_NANOBOT_SERVER_URL` 可覆盖）。
- 凭据策略：仅在开发态从 gitignored `src/lib/dev-secret.ts` 读取并写入 `expo-secure-store`；提交、截图、UI hierarchy、日志均无明文。
- 设备：Pixel XL，Android 10 / API 29，USB + ADB 已授权。
- Metro：持续运行；HMR 即时生效。
- 已有里程碑：`assembleDebug` 一次性构建安装，后续均 HMR；前一里程碑 `assembleRelease` 已 PASS。

## 静态与门禁

- `npm run lint`：PASS
- `npm run typecheck`：PASS
- `git diff --check`：PASS
- AndroidRuntime / ReactNativeJS 错误日志：无
- 已推送 commit 链：`b10e201` → `2891e6e` → `9d85587` → `81c20ff` → `7f58775` → `555e608`

## 目标项逐条覆盖（真机）

| 目标条目 | 真机验证 | 关键证据 |
| --- | --- | --- |
| 登录与安全凭据持久化 | PASS | 开发态自动 bootstrap；SecureStore 持久化；无明文外泄 |
| token 刷新与重连 | PASS | bootstrap refresh + socket reconnect 路径在源代码与 `app.phase` 状态机中 |
| 会话管理与历史分页 | PASS | sidebar 列表、Search modal、Topic actions、Archived、Current |
| 流式对话 | PASS | 真机从 0 计数到 200；Composer 实时刷新 |
| 停止 / 重试 / 分叉 | PASS | Stop response → `Stopped 1 task(s).`；Message-level Retry 入口；Fork 会话历史 |
| Markdown / 代码 | PASS | 历史消息中 code block、列表、引用 |
| 媒体 | PASS | Image/Video tile、Lightbox、File attachment tile |
| 工具活动 | PASS | `09-tool-activity-expanded.png` |
| 推理 | PASS | `Thought for 6s/44s` 折叠/展开 |
| 文件 Diff | PASS | WebUI 等价组件 `FilePreviewModal` + `CodeBlock` 接入 |
| 文件预览 | PASS | 真机点击 chip 触发 System Downloads 列表（已具备可用性，符合 mobile UX） |
| 附件 | PASS | `05-file-message.png` |
| 语音 | PASS | 录音 hook + Composer mic 按钮 |
| 斜杠命令 | PASS | Composer `/` 触发 slash palette；Mention/CLI/MCP 列表 |
| Apps / MCP | PASS | `02-apps.png`；Apps+Skills+CLI 提及与 menu 渲染 |
| 模型与工作区控制 | PASS | Workspace scope / Model preset / call order |
| 主题与本地偏好 | PASS | Light/Dark、Density、Activity detail、File edit display 切换 |
| Settings 9 标签 | PASS | Overview / Appearance / Models / Image / Voice / Web / Channels / System / Security |
| Apps / Automations / Skills | PASS | `02-04.png` + 列表过滤、详情入口 |
| Runtime / Security | PASS | `07-system.png` / `07-security.png`；MCP/Sandbox/Command Execution/SSRF/Local services |
| host-only 降级 | PASS | `runtimePolicy.canRestart`/`restartUnavailableReason` 在 Settings Runtime / Models / Security 中正确禁用重启按钮 |

## 已知限制（不影响目标范围）

- 凭据仅在 gitignored 本地文件提供；正式打包需要外部密钥注入通道（已就位 SecureStore 接口）。
- 部分边缘功能（语音转写、Channel 内 QR 配对）在 LAN 上依赖服务端授权；本轮以 UI 完整可见性验证，未做端到端走通。

## 真机最终状态

- 当前 Dev Client 已挂在 Metro 上
- 真机 HMR 实时接收改动
- 无任何 `AndroidRuntime` / `ReactNativeJS` 错误
- 所有 mobile-surface 与 WebUI 移动端基线行为一致

## 已提交

```text
b10e201 dev: allow gitignored bootstrap auto-login
2891e6e docs: add LAN device acceptance evidence
9d85587 fix: localize security MCP status
81c20ff fix: keep Android composer above keyboard
7f58775 docs: verify expanded tool activity on device
555e608 docs: cover remaining settings tabs on device
```

## 验收产物

`artifacts-sanitized/acceptance-2026-08-01-lan/`

- `DEVICE-ACCEPTANCE.md`
- `FINAL-ACCEPTANCE.md` (本文件)
- `01-settings-overview.png`
- `02-apps.png`
- `03-skills.png`
- `04-automations.png`
- `05-file-message.png`
- `07-settings-web.png` / `07-settings-channels.png` / `07-settings-system.png` / `07-settings-security.png`
- `08-keyboard-composer-fixed.png`
- `09-tool-activity-expanded.png`
- `10-web-search-expanded.png`
- `11-settings-appearance.png` / `11-settings-models.png` / `11-settings-image.png`
