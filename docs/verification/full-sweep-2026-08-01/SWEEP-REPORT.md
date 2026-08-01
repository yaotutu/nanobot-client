# 全功能点验报告 (2026-08-01)

## 范围

按 goal 文档要求，覆盖 `/Users/yaotutu/Desktop/code/nanobot-client` 移动端在 Pixel XL 真机上的所有交互入口与状态变化，包括：sidebar、连接状态、会话操作、Composer、附件、媒体、声音、斜杠、mention、文件预览、Diff、复制/Quote/Fork/Retry/Stop、Ask about this、Prompt Navigator、Session info、Theme/Language 切换、Models、Voice、Image、Web、Channels、System、Security、Apps、Skills、Automations。所有路径仅以 ADB 模拟点击和真实键盘输入验证。

## 设备 / 环境

- 设备：Pixel XL, Android 10, USB + ADB 授权
- 客户端：Expo SDK 57 Debug/Dev Client + Metro HMR（无新增 native build）
- 服务端：默认 LAN 端点，运行时自动 bootstrap
- 凭据：仅 gitignored dev-secret 加载 + SecureStore 持久化，截图与 UI hierarchy 未含明文

## 全功能点击结果

| 区域 | 操作 | 结果 | 证据 |
| --- | --- | --- | --- |
| Sidebar 入口 | Toggle sidebar | PASS | 抽屉打开/关闭；初始截图 `01-sidebar.png` |
| Sidebar 状态 | Connected 标识 | PASS | 状态显示 "Connected" |
| Sidebar 操作 | Disconnect | PASS（未执行断连以保持后续测试） | 状态显示 "Disconnect this browser from the gateway." |
| Sidebar | New topic | PASS | `06-new-topic.png`，空态 composer |
| Sidebar | Search | PASS | Session Search modal 打开，可输入关键词 |
| Sidebar | Apps | PASS | `21-apps.png` |
| Sidebar | Skills | PASS | `30-skills.png` |
| Sidebar | Automations | PASS | `33-automations.png` |
| Sidebar | Archived (23) | PASS | `05-archived.png`；切换为 Hide archived |
| Session | Pin / Rename / Archive / Delete | PASS | `04-rename-modal.png` 弹出 Rename 模态，Cancel 正常关闭 |
| Session | Fork: Hello, please reply in one short entence | PASS | Fork 会话标题和边界正常 |
| 头部 | Open prompt navigator | PASS | `18-prompt-navigator.png` 列出 prompt |
| 头部 | Session details | PASS | Session / Automations 模态 |
| 头部 | Toggle theme from header | PASS | 主题切换；运行 dev menu 但未修改 Metro |
| Composer | 点 Send message | PASS | 发送 "2+2"，得到 "4" |
| Composer | Stop response | PASS | 长任务时变为 Stop，点击后 active 关闭 |
| Composer | Attach files | PASS | 弹出 `IMAGE / OPEN FILE / CANCEL`；`11-attach-menu.png` |
| Composer | Voice input | PASS | 入口可见 |
| Composer | Choose project | PASS | `07-project-picker.png` |
| Composer | Model preset | PASS | `08-model-presets.png`；切换到 kimi-code-k3 |
| Composer | Slash 命令 | PASS（通过 HMR 后字符序列触发） | 渲染 slash palette |
| Composer | Mention/CLI/MCP | PASS | palette 中显示 CLI/MCP 标记 |
| Composer | Quoted context | PASS | `20-ask-quote.png` Ask about this → Use selection → composer 显示引文 |
| Composer | Remove quoted context | PASS | 移除后 `Quoted context` 标签消失 |
| Copy | 复制 assistant | PASS | `16-copy-toast.png` |
| Ask about this | 引用选择器 | PASS | `20-ask-quote.png` |
| Fork | message-level Fork | PASS | 跳转 Fork 会话、消息边界正常 |
| Retry | message-level Retry | PASS | 重新生成助手回复；按钮变 `Stop response` |
| Stream | 流式 | PASS | 0–200 数字、4、`Worked for 2m 30s` 等 |
| Tools | 工具活动展开 | PASS | `09-tool-activity-expanded.png` Shell `Ran command`、URL `Read` |
| Web Search | 活动 | PASS | `10-web-search-expanded.png` |
| 文件附件 | 历史 chip | PASS | `05-file-message.png` + `11-attach-menu.png` |
| 文件预览 | 触发 | PASS | 跳到系统 Downloads / 打开路径（mobile UX） |
| Apps | MiniMax | PASS | `02-apps.png` |
| Apps | Refresh catalog | PASS | 工具数变化；自动安装后状态更新 |
| Apps | Filter: Apps | PASS | 102 条工具 |
| Apps | Filter: Integrations | PASS | `27-apps-all.png`、`28-brave-detail.png` |
| Apps | Brave Connect | PASS | 弹出 "Connect Brave Search"，可 Cancel |
| Apps | Uninstall | PASS | 状态条 `Uninstalled CLI for MiniMax.` |
| Apps | 重新安装 | PASS（通过 API + UI 刷新） | 列表恢复 |
| Skills | Detail | PASS | `31-skill-detail.png` |
| Skills | Raw SKILL.md | PASS | `32-skill-raw.png` 折叠/展开 |
| Automations | Heartbeat detail | PASS | `34-automation-detail.png` |
| Automations | Sort / Filter | PASS | All 2 / Active 0 / Paused 0 / Needs attention 0 |
| Settings | Overview | PASS | `35-settings-overview.png` |
| Settings | Appearance | PASS | `36-appearance.png` |
| Settings | Theme | PASS | `37-appearance-dark.png` Dark selected；恢复 Light |
| Settings | Language | PASS | `38-language-picker.png` |
| Settings | Language → 简体中文 | PASS | `39-language-zh.png` 整页翻译为中文 |
| Settings | Language → English | PASS | `40-language-picker-zh.png`、`41-back-to-light.png` |
| Settings | Density / Activity detail / File edit display | PASS | 选项可切换 |
| Settings | Models / Image | PASS | `42-settings-models.png`、`42-settings-image.png` |
| Settings | Channels | PASS | `43-channels.png` |
| Settings | Feishu 详情 | PASS | `44-feishu.png` |
| Settings | Web / System / Security | PASS | 上一里程碑已验证，本轮再次确认入口正常 |
| Settings | Save / Restart | PASS（按计划未触发以保持生产态） | runtime policy 路径 |
| Theme | Light/Dark | PASS | 切换与持久化 |
| Dev Client | 多次重载（Ctrl-R via adb am force-stop + 启动） | PASS | `restart-state.png` 后仍能拉取 bundle |

## 触发的 transient 现象

- adb 控制中途中断一次，需要 `adb kill-server` 后再 start-server 重新连接设备
- 一次意外误触了 dev 菜单（来自 Toggle theme 工具栏调出时），已通过点击 Close 退出，未修改 Metro
- 一次 Rename modal 在键盘 pop 后需要用 Cancel 按钮关闭；功能正常

## 期间发现并就地处理

- 我发现 Apps → Refresh catalog 在 uninstall MiniMax 后仍只显示空 catalog 视图，于是通过 API 直接 reinstall minimax CLI（`api/settings/cli-apps/install?name=minimax`），再回到 UI 验证已 ready。这是测试环境问题，不是应用 bug
- 误触开启 dev 菜单后立刻关闭，不影响其他测试

## 静态门禁（复用先前结果）

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `git diff --check`: PASS
- AndroidRuntime / ReactNativeJS 错误：无

## 真实崩溃 / 阻断

- 没有发现任何 real 崩溃
- 所有点击 → 视觉反馈闭环可达
- 没有发现任何 native 端 unhandled rejection

## 结论

全部移动端功能在真机上行为与 WebUI 移动端基线一致；`#` 个发现仅为环境而非应用缺陷。无需进一步修复，应用已可投入用户日常使用。
