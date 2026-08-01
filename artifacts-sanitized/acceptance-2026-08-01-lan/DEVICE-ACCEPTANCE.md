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

## 本轮静态门禁

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `git diff --check`: PASS
- Debug native build/install: PASS (`assembleDebug`, one-time dev-client installation)

本轮没有重新执行 Release 构建；前一里程碑已有 Android JS export 与 `assembleRelease` PASS 证据。
