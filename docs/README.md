# docs/

`nanobot-client` 的工程文档与可提交验证证据。

## 文档

- [`architecture.md`](architecture.md) — 分层规则、feature 公共接口、认证代次、连接恢复、WebSocket 拆分和验证矩阵。
- [`android-release.md`](android-release.md) — Android Release APK 打包、GitHub Release 发布、缓存和清理说明。
- `verification/` — 清洗后的设备验收证据；每个子目录代表一次验证，例如 `acceptance-2026-08-03-lan/`。

## 仅保留在本地的产物

原始日志、未脱敏截图和 `adb logcat` 输出不得放入 `docs/`。它们统一写入已被 Git 忽略的 `.local/verification-raw/`；只有完成脱敏后才能整理到 `docs/verification/`。
