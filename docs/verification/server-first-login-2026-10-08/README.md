# 服务器优先登录流程验证（2026-10-08）

## 范围

验证首次安装、连接失败、密码错误、登录成功与重启恢复时的服务器/密码步骤流转。

## 结果

- 清空应用数据后，首屏为「配置服务器」，不出现密码输入框。
- 输入不可达地址后，返回服务器配置页并显示连接错误。
- 输入有效服务器并继续后，进入密码页，同时保留「更换服务器」入口。
- 密码错误时停留在密码页，不重复要求配置服务器。
- 使用局域网网关登录成功后进入聊天页。
- 强制停止后重新启动，可自动恢复登录并进入聊天页。

## 自动化验证

- `npm run check`
  - ESLint 通过
  - TypeScript 通过
  - Vitest：321 tests passed
  - Native Jest：128 tests passed
  - Android bundle smoke 通过

## 截图

- `server-first-launch.png`：首次启动进入服务器配置。
- `server-unreachable.png`：连接失败回到服务器配置。
- `server-login-success.png`：确认服务器后进入聊天页。
- `server-restart-auth-success.png`：重启后自动恢复登录。
