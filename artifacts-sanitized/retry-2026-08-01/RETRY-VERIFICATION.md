# Retry 按钮真机验证（2026-08-01）

服务端：`http://localhost:8765`（通过 `adb reverse tcp:8765 tcp:8765` 桥接到 LAN 192.168.55.147）
设备：Pixel XL（HT7390201404，Android 10）
通道：Expo SDK 57 + Metro HMR（无 Release 构建）

## 操作序列

1. 在「新闻频道」话题里发送 `ping`。
2. 等到模型生成完整 assistant 回复（SQL schema）。
3. UI 渲染：消息操作菜单出现 `Copy / Ask about this / Fork / Retry` 四个按钮（顺序与 WebUI 移动端一致）。
4. 点击 Retry 按钮 → 服务端重新生成了一份新的完整 assistant 回复（含 digest 目录退役段落）。
5. 新回复底部同样出现完整的 `Copy / Ask about this / Fork / Retry` 操作栏。

## 截图

- `nanobot-retry-final5.png`：原 assistant 上 Retry 按钮可见。
- `nanobot-retry-final8.png`：点击 Retry 后短暂显示 `[retry]` turn-id 提示。
- `nanobot-retry-final9.png`：新 SQL schema 回复渲染。
- `nanobot-retry-final12.png`：新回复的文件结构 / 目录退役段落渲染。

## 备注

- 所有数据走 reverse tunnel，未写入任何凭据、token。
