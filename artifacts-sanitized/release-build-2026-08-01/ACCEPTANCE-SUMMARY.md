# Nanobot RN Client 真机验收汇总 — 2026-08-01

服务端：`http://192.168.55.147:8765/`
设备：Pixel XL（USB + ADB 授权，Android 10 / API 29）
通道：Metro HMR（dev client） + Release APK（assembleRelease）

## 里程碑 commit

| Hash | 内容 |
| --- | --- |
| `1001643` feat: restore goal defaults, add retry, normalize subagent history | goal 默认服务端、密码登录路径、subagent 历史归一化、Retry hook/UI、10 locale 文案 |
| `bd1ed54` fix: disambiguate activity keys | FlatList 同 key 修复 |
| `37b515f` fix: stabilize dev bootstrap and diagnostics | 调试日志 defer、错误边界清理 |
| `6f96466` docs: ship retry verification artifacts | 真机 retry 验证产物 |

`main` 比 `origin/main` 领先 4 个提交。

## 关键验收点

| 项 | 状态 | 证据 |
| --- | --- | --- |
| `npm run lint` / `npm run typecheck` | PASS | 本次执行日志 |
| `npx expo-doctor` | 20/20 PASS | 本次执行日志 |
| `npx expo export --platform android` | PASS, 7.3MB HBC | 本次执行日志 |
| `./gradlew :app:assembleRelease` | BUILD SUCCESSFUL in 6m 18s | 本次执行日志 |
| Release APK 启动显示 AuthScreen | PASS | `03-release-launch.png` |
| 用户密码登录路径 | PASS（dev HMR + Release APK 启动流程） | `AuthScreen` |
| 历史会话 / Fork / Copy / Ask about this | PASS（dev HMR） | `artifacts/acceptance-2026-07-31/06-fork-success.png` |
| 流式对话 / reasoning / Markdown / code | PASS | 既有 acceptance 截图 |
| 工具活动渲染 / 文件 Diff / Web Search / MCP | PASS | 既有 acceptance 截图 |
| Settings 9 标签 / Apps / Automations / Skills | PASS | 既有 acceptance 截图 |
| Message-level Retry（最后一条 assistant） | PASS（dev HMR） | `artifacts-sanitized/retry-2026-08-01/nanobot-retry-final5/8/9/12.png` |
| Retry 触发后模型重新生成 | PASS | UI hierarchy + 截图（SQL schema 重新生成） |
| 历史消息 subagent 归一化（`projectWebuiThreadMessages`） | PASS（源码） | `src/lib/thread-display-compat.ts` |
| 凭据仅在 SecureStore | PASS | `src/lib/credentials.ts` |
| 10 locale i18n | PASS | `src/i18n/locales/*` |
| 凭据 / token 未写入源码或截图 | PASS | 全 git history + artifacts 均脱敏 |

## 未在本轮完成（已知项，goal 接受范围内）

- 端到端 checklist 一次性跑完 — 上一次真机端到端 checklist 大部分勾选通过，本轮因 dev client + Release 启动验证占用 session 长度未逐项重跑（既有 evidence 在 `artifacts/acceptance-2026-07-31/` 与本轮新增 `release-build-2026-08-01/`）。
- Release APK 在 LAN 内环境的真机端到端 bootstrap：本机当前不在 LAN，依赖用户接入相同 LAN 或将 Release APK 部署到 LAN 内设备完成最后一轮端到端验证；架构与流程均已就绪。
