# 消息页完整 UI 重构验证

## 参考与范围

- 参考本地 `../openmuse` 的 CopilotKit/OpenMuse 手机界面，版本 `73a714963b57e5cd1747fd3fbc6833e09a36b81a`，重点为 `apps/mobile/src/ui.tsx`、`chat.tsx`、`App.tsx`。
- 采用其轻量顶栏、柔和蓝／灰消息气泡、圆角输入区、宽松阅读层级；不搬入 OpenMuse 的音乐、收藏等其他业务。
- 重构范围为消息页及聊天所需的模型／工作区控件。认证、侧栏业务、后端均不改造；不新增依赖。

## 新结构与删除项

- `chat-theme.ts` 集中管理聊天浅／深色与布局尺寸，消息页不再把旧共享颜色作为视觉实现入口。
- `ChatHeader` 为侧栏、标题／提示导航、新会话；主题切换留在本地设置，不占用顶栏。
- `ChatSurface` 仅切换空页、加载与消息内容，底部 composer 始终挂载一次。
- `ComposerInputRow` 为附件、输入、发送／停止；模型、权限、项目位于独立 footer。
- 用户蓝色气泡、助手灰色气泡；统一 Markdown、代码、表格、推理、工具活动、文件编辑的呈现。保留消息复制、引用、分叉、重试与附件展示。
- 删除 `ComposerToolbar.tsx`、hero/thread 视觉分支、空页功能卡片、顶栏主题按钮和相关旧翻译。
- 本地偏好只保留主题与语言；删除密度、活动模式、文件编辑模式、代码换行与品牌标识偏好，不保留旧默认值／兼容分支。
- 删除 `thread-display-compat.ts` 的旧历史文本兼容处理；当前控制命令过滤与时间处理集中在 `thread-messages.ts`。

## 实测发现并修复的历史加载问题

真实网关 `/webui-thread` 返回 `schemaVersion: 3 / projection: events`，不再包含 `messages`。旧客户端直接读取 `thread.messages`，导致加载历史时出现 `map of undefined`。

当前实现只接受 schema 3 的事件快照，由 `thread-events.ts` 顺序回放并复用实时 `stream-fold`。服务端 `projection_id` 提供稳定消息身份；完整 reasoning／stream end 文本覆盖 delta；事件分叉边界转换为可见消息边界；运行状态取服务端字段。没有旧 messages wire fallback。

## 自动检查

- 最终 `npm run check`：退出码 0。
- ESLint、TypeScript：通过。
- Vitest：34 个文件、173 项测试通过。
- Native Jest：7 个测试套件、33 项测试通过。
- Android bundle smoke：通过。此项是 JS/Hermes 导出，不等同于 Release APK 构建。
- `git diff --check`：通过。
- 新增历史回放 7 项测试、HTTP 协议边界 5 项测试、Native 聊天布局／交互 5 项测试。
- `expo-doctor`：20/21 通过；唯一失败项为现有 Expo SDK 57 依赖补丁版本未对齐，包括 Expo 57.0.9、React Native 0.86.2 等。本次未修改 package.json/package-lock.json，也未进行依赖升级。

原始检查日志仅保留在 `.local/verification-raw/check-complete.log` 与 `expo-doctor.log`，不复制包含真实环境信息的日志。

## Android 模拟器验证

- 新会话空页、固定底部输入区域、模型与工作区 footer。
- 测试会话发送与接收；从侧栏重新打开后，用户消息、推理、助手回复均可加载，无旧历史读取异常。
- 浅色／深色切换、状态栏文字对比度、列表、标题、表格、Python 高亮与换行。
- “Ask about this” → “Use selection” 引用流程、引用预览；真实软键盘打开后输入区和 footer 位于键盘上方。
- 最终清除未发送的测试草稿和引用，恢复 Light／English；恢复模拟器硬键盘显示软键盘设置的原值。

### 截图

下面仅包含专用 UI 测试会话／空会话内容，没有用户会话列表、密码、token 或真实工作区路径。右上方圆形浮层是 Expo 开发工具入口，不属于业务 UI，未在截图中人为擦除。

| 场景 | 截图 |
| --- | --- |
| 浅色空会话 | [empty-light.png](empty-light.png) |
| 用户／助手气泡、推理、阅读层级 | [thread-light.png](thread-light.png) |
| 浅色表格／代码 | [markdown-light.png](markdown-light.png) |
| 深色表格／代码、白色状态栏文字 | [markdown-dark.png](markdown-dark.png) |
| 深色引用与真实软键盘避让 | [keyboard-quote-dark.png](keyboard-quote-dark.png) |

## 未覆盖的验证

- 未做 iOS 设备测试、Web 浏览器端完整交互测试或 Release APK 验收。
- 停止／排队发送有 Native／单元测试覆盖，但未在本轮模拟器上逐一做真实服务端停止操作。
- 图片／视频／文件历史投影有单元测试覆盖；未逐一实测附件上传和视频播放。

## 提交边界

本地提交仅包含消息页重构、当前历史协议处理、回归测试、架构说明与已检查的 UI 测试截图。不包含原生构建产物、开发凭据、原始日志或依赖升级。
