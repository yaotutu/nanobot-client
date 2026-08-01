# Nanobot RN — LAN 真机增量验收（2026-08-01）

## 环境

- 实体设备：Pixel XL，Android 10 / API 29
- 连接：USB + ADB 已授权
- 客户端：Expo SDK 57 Debug/Dev Client + Metro HMR
- 服务端：目标 LAN gateway（地址按产品默认配置；本文不记录任何凭据）
- 原生构建策略：本轮只执行一次 `assembleDebug` 以替换此前安装的 Release APK；之后均使用 Metro HMR

## 安全检查

- [x] 开发凭据来源文件被 `.gitignore` 排除
- [x] 首次开发态 bootstrap 后由 `expo-secure-store` 持久化
- [x] Git 跟踪文件未出现运行时密码
- [x] 截图、UI hierarchy 与日志不包含密码、API Token 或 WebSocket Token
- [x] 生产路径不会读取本地开发凭据

## 真机检查结果

| 功能 | 结果 | 证据/观察 |
| --- | --- | --- |
| 自动 bootstrap | PASS | Dev Client 冷启动后直接进入主界面，不显示 AuthScreen |
| 主界面与连接 | PASS | 显示空态 composer、workspace 与 model preset；无 AndroidRuntime/ReactNativeJS error |
| 会话列表 | PASS | sidebar 加载 Topics、Archived、pinned/action controls，状态显示 Connected |
| 会话切换与历史 | PASS | 打开既有 Fork 会话并显示 user/assistant 历史与时间戳 |
| Fork 历史 | PASS | Fork 会话标题与分叉后的消息边界正常 |
| Retry | PASS | 最后一条 assistant 显示 Retry；既有重生成验收证据仍有效 |
| Markdown / reasoning | PASS | 历史消息渲染段落与 `Thought for 6s` 折叠活动 |
| Composer 键盘 | PASS | 点击 composer 后 `mInputShown=true`、EditText focused；此前键盘问题未复现 |
| Settings Overview | PASS | Token activity、AI capabilities、model/provider 状态正常；见 `01-settings-overview.png` |
| Apps | PASS | catalog 加载、ready filter、MiniMax app ready；见 `02-apps.png` |
| Skills | PASS | 16 skills、available 状态与详情入口正常；见 `03-skills.png` |
| Automations | PASS | all/active/paused/attention filters、system jobs 与详情正常；见 `04-automations.png` |
| 文件附件 | PASS | 历史文件附件 tile、文件名、打开提示与 reasoning 同屏正常；见 `05-file-message.png` |
| Settings Web | PASS | provider、无凭据 DuckDuckGo、max results、timeout、Jina reader；见 `07-settings-web.png` |
| Settings Channels | PASS | 16 channel catalog、running/setup 状态与详情入口；见 `07-settings-channels.png` |
| Settings System | PASS | identity、timezone、API server、runtime capability 状态；见 `07-settings-system.png` |
| Settings Security | PASS | web safety、workspace/sandbox/command/MCP 状态；见 `07-settings-security.png` |

## 本轮静态门禁

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `git diff --check`: PASS
- Debug native build/install: PASS (`assembleDebug`, one-time dev-client installation)

本轮没有重新执行 Release 构建；前一里程碑已有 Android JS export 与 `assembleRelease` PASS 证据。

## 本轮发现并修复

- Security 页面错误显示原始 i18n key `settings.mcp.title`；改为 WebUI 已有的 `settings.sections.mcp`，HMR 后真机显示 `MCP services`。

## Composer 与 Stop 回归（增量）

- 发现 Android 实体设备上键盘打开时，原先 `KeyboardAvoidingView` 未设置 Android behavior，composer 被 IME 完全遮挡。
- Android behavior 改为 `height` 后通过 Metro HMR 验证：composer 与 Send 按钮稳定显示在键盘上方，见 `08-keyboard-composer-fixed.png`。
- 发送长回复请求后真机出现 `Stop response`；点击后按钮退出 active 状态，并显示 `Stopped 1 task(s).`，Stop 协议与 UI 状态通过。

## 复杂活动渲染（增量）

- 历史长任务默认折叠为 `Worked for …`，点击后正常展开 reasoning 与工具 timeline。
- Shell 工具活动显示 `Ran command`、命令摘要、脚本类型与行数；见 `09-tool-activity-expanded.png`。
- URL/file read 活动显示 `Read`、来源 hostname/path；多条 command/read 与 reasoning 保持服务端顺序；见 `10-web-search-expanded.png`。
- Activity cluster 展开/折叠、历史消息正文、Fork boundary 与 composer 同屏无布局阻断。

## Settings 剩余子页（增量）

- **Appearance**：Theme / Language / Density / Activity detail / File edit display 与 WebUI 选项一致；`11-settings-appearance.png`
- **Models**：Model presets、call order、Model providers（SiliconFlow / OpenAI Codex / Kimi Coding / MiniMax）状态显示正常；`11-settings-models.png`
- **Image**：Image generation 开关、provider 状态、image model / aspect / size 默认项与 WebUI 一致；`11-settings-image.png`
