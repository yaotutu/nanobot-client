# 聊天核心精简验证（2026-10-06）

## 自动化验证

本次执行 `npm run check`，退出码为 0：

- ESLint：通过。
- TypeScript（`tsc --noEmit`）：通过。
- Vitest：32 个测试文件、149 个测试通过。
- Native Jest：6 个测试套件、28 个测试通过。
- Android Metro export：成功生成 Hermes JavaScript bundle。
- `git diff --check`：通过。
- `package.json` 与 `package-lock.json` 根依赖声明一致。

新增回归覆盖模型目录裁剪、新会话模型切换顺序、服务端拒绝删除时保留会话、本地偏好兼容、设置弹窗和聊天导航状态。Native Jest 是组件与 hook 测试，不是真机测试；Metro export 也不等同于 Gradle 原生构建。

## 用户验收反馈

用户在本次提交前反馈：“测试了下，基本没问题”。该反馈作为整体试用结果记录，不代表下方每项专项检查都已逐项完成；Agent 未独立执行 Android 原生构建或模拟器/真机 UI 验证。

## 原生更新与专项验收参考

由于移除了原生依赖和权限，更新旧开发版时需要在已配置好的开发环境重新生成、安装一次：

```bash
npm ci
npx expo prebuild --platform android --clean
npm run android
```

`--clean` 会重建生成的 Android 工程；若有手工原生改动，应先备份。不需要重复配置 Java 或 Android SDK 环境变量。

专项验收清单（用于后续回归，未逐项确认完成）：

- 使用现有网关地址登录，验证消息发送、流式输出和断线重连。
- 新建会话，选择模型后发送首条消息，确认模型选择生效。
- 验证图片/文件附件、历史会话、搜索和工作区切换。
- 打开并关闭设置，确认聊天草稿和流式状态保留。
- 切换主题与语言，重启应用确认偏好保存；确认退出登录正常。
- 确认 Apps、Skills、Automations、渠道配置、语音录制和服务端设置入口不再出现。
- 对关联自动化的会话尝试删除，确认显示拒绝提示且会话仍保留，不触发级联删除。
