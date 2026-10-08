# 模拟器对话验证（2026-10-08）

## 环境

- 设备：Android 模拟器 `emulator-5554`
- 应用：`com.anonymous.nanobotclient`
- 网关：`http://192.168.55.201:8765`
- 鉴权：使用本地配置的网关密码

## 过程

1. 使用 `curl` 验证 `GET /webui/bootstrap` 返回 `HTTP 200`。
2. 通过 ADB 启动应用。
3. 在消息输入框输入 `hello_from_emulator` 并点击发送。
4. 等待模型回复并抓取 UI 层级与截图。
5. 检查 `logcat` 中是否出现 `FATAL EXCEPTION` 或 `AndroidRuntime` 崩溃。

## 结果

- 用户消息 `hello_from_emulator` 正确显示。
- 模型返回：`你好！有什么我可以帮你的吗？`
- 消息回复时间正常显示。
- 应用进程保持运行。
- 未发现 `FATAL EXCEPTION` 或 `AndroidRuntime` 崩溃。
