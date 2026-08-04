# 客户端架构

本文描述 `nanobot-client` 当前的模块边界、依赖方向和连接恢复设计。新增代码应优先遵循这些规则；如果确实需要跨层依赖，应先调整公共接口，而不是直接深层导入实现文件。

## 1. 总体依赖方向

业务代码的主依赖链为：

```text
src/app
  -> src/features/app
    -> src/features/<feature>/index.ts
      -> src/services + src/types + src/ui
```

各层职责如下：

- `src/app/`：Expo Router 路由与根布局。业务页面只通过 `@/features/app` 进入应用编排层。
- `src/features/app/`：组合 auth、connection、chat、sidebar、settings 等业务域，管理应用级生命周期。
- `src/features/<feature>/`：单一业务域的组件、hook、model、store 与 feature API。
- `src/services/`：不依赖 feature 的跨业务基础设施，例如 API、凭据、链接、文本与运行时服务。
- `src/types/`：wire format 和共享领域类型，不依赖 feature、组件或 UI 表现类型。
- `src/ui/`：共享 palette 和低业务耦合 UI 原语。

`src/app/_layout.tsx` 可以直接使用启动屏、错误边界、i18n 和本地偏好等根基础设施；这不代表普通业务路由也可以绕过 `features/app`。

## 2. Feature 公共接口

每个业务域通过以下文件暴露跨 feature 能力：

```text
src/features/<feature>/index.ts
```

跨 feature 调用必须使用公共入口：

```ts
import { useConnectionStore } from '@/features/connection';
```

不要跨 feature 深层导入：

```ts
// 禁止：绕过 connection 的公共契约
import { useConnectionStore } from '@/features/connection/store';
```

feature 内部可以按职责继续拆分：

```text
components/  展示与交互组件
hooks/       生命周期和控制器 hook
model/       纯派生模型与展示契约
store/       业务状态与归并逻辑
api.ts       feature 级网关操作
index.ts     跨 feature 公共 API
```

ESLint 的 `no-restricted-imports` 规则会强制以下边界：

- infrastructure 不依赖 feature 或 application components；
- feature 不依赖 Expo Router；
- feature hook/model 不依赖 presentation components；
- 非 app feature 不依赖 `features/app`；
- 跨 feature 只能经过目标 feature 的 `index.ts`；
- `src/app` 的业务组合只能经过 `@/features/app`。

## 3. 启动与认证生命周期

根布局负责：

1. 阻止 Expo 启动屏自动隐藏；
2. 初始化 i18n；
3. hydrate 本地偏好并应用语言；
4. 安装根错误边界和 DebugOverlay；
5. 准备完成后隐藏启动屏并渲染 Router Stack。

认证状态使用两个不同的“代次”避免无意义的全局刷新：

- `sessionEpoch`：登录身份会话代次。首次 bootstrap、重新认证或从无会话恢复时递增；静默 token 续期不改变它。
- `tokenGeneration`：token 签发代次。每次成功获得新 token 都递增，用于重建依赖一次性 token 的连接和续期计时器。

因此，业务目录初始化依赖 `sessionEpoch`，不会因为静默续期重复清空或重拉全部业务状态；连接和 token 计时器则可以响应 `tokenGeneration`。

`src/services/api/bootstrap.ts` 只返回数据或结构化错误码，不依赖 i18n。错误码在 auth feature 边界翻译成用户文案，保持基础服务与表现层解耦。

## 4. 连接恢复

应用级恢复逻辑位于：

```text
src/features/app/hooks/use-connection-recovery-lifecycle.ts
```

它同时监听：

- NetInfo 离线/在线变化；
- AppState 后台/前台变化；
- 最近一次 socket 活动时间；
- socket 当前状态。

恢复策略：

- 离线时立即通知 transport，不继续建连，并拒绝不应悬挂的 pending request；
- 网络恢复且应用处于前台时立即重连；
- 从后台回到前台后，如果后台时间达到阈值、socket 非 open，或连接活动已 stale，则主动重连；
- 恢复原因记录在 connection store 的 `reconnectReason`，用于业务层决定是否重新拉取 canonical history；
- transport 的 `reconnectNow()` 不接收业务原因，只执行刷新一次性 WebSocket 凭据并替换连接。

这种分工避免 transport 了解前后台、网络来源或聊天历史等业务语义。

## 5. WebSocket 模块

连接模块按职责拆分为：

```text
socket-transport.ts          连接状态、建连/断开、重连协调、queue flush
socket-protocol.ts           帧类型、序列化/解析、turn id、帧大小检查
socket-commands.ts           出站命令帧与请求级队列清理
socket-inbound-router.ts     入站事件路由
socket-listeners.ts          status/event/run status 监听器分发
socket-pending-registry.ts   new chat、message、system、transcription 的 Promise 生命周期
socket-outbound-queue.ts     尚未成功写入 socket 的帧队列
socket-reconnect-policy.ts   transport 退避策略
connection-recovery-policy.ts 应用前台恢复判定
socket-errors.ts             可供业务识别的 transport 错误
```

关键约束：

- `knownChats` 由 transport 持有，并以共享引用提供给函数式 command handler；
- `attach` 断线时不进入 outbound queue，连接打开后由 transport 对 `knownChats` 统一重放；
- request settlement 会移除对应的未发送帧，避免恢复网络后发送已经超时的请求；
- message 即使在离线或帧过大时也先创建 `MessageSendResult`，再拒绝 `accepted`，保证调用方 API 形状一致；
- socket close 会区分未发送、已发送但结果未知和 transient request，并执行对应清理。

## 6. Chat 流归并与展示模型

assistant stream-fold 按事件语义拆分：

```text
assistant-reasoning-events.ts   reasoning chunk 与 reasoning close
assistant-answer-events.ts      answer chunk 与 stream_end
assistant-completion-events.ts  完整 message、side-channel 与 turn completion
assistant-events.ts             兼容导出入口
```

归并函数优先返回新消息数组；`StreamFoldState` 只保存流控制游标、已关闭 id 和活动 segment 等运行时状态。所有合并都必须校验 turn，防止并发或恢复事件写入错误消息。

较大的展示组件也已拆开：

- 文件预览：modal 请求生命周期、纯 model、语法高亮；
- 媒体画廊：gallery 编排、视频附件、图片 lightbox、附件去重 model；
- 工具活动：稳定 presentation 入口、label、detail、format。

纯 model 应优先覆盖单元测试，React 组件只保留布局、hook 生命周期和事件绑定。

## 7. API 类型入口

chat 和 settings 类型采用“窄入口 + 兼容入口”策略：

```text
src/types/api/chat/<domain>.ts
src/types/api/settings/<domain>.ts
```

新代码应从最窄的领域文件导入，例如：

```ts
import type { InboundEvent } from '@/types/api/chat/events';
import type { UIMediaAttachment } from '@/types/api/chat/media';
```

以下文件暂时保留，用于兼容旧调用方，不应删除：

```text
src/types/api/chat.ts
src/types/api/chat/index.ts
src/types/api/settings.ts
src/types/api/settings/index.ts
src/features/settings/api.ts
```

迁移应逐步进行，不能为了追求目录整洁一次性破坏外部导入契约。

## 8. Services 归属

只有不属于单一 feature、且被多个业务域共享的能力才进入 `src/services/`。例如 `nanobot-features.ts` 同时被 channels 和 settings 使用，因此保留在 `services/api`，而不是强行归入其中一个 feature 形成反向依赖。

服务层应遵循：

- 不导入 feature；
- 不直接生成面向用户的 i18n 文案；
- 网络错误尽量转换为稳定错误类型或错误码；
- 平台 API 和资源清理由 service/hook 自身负责；
- wire format 类型从 `src/types/api` 的窄入口导入。

## 9. 验证矩阵

提交前必须运行：

```bash
npm run check
```

该命令依次执行：

1. ESLint（包含架构边界和 import cycle 检查）；
2. TypeScript `tsc --noEmit`；
3. Vitest 纯逻辑测试；
4. Native Jest 生命周期测试；
5. Metro Android bundle smoke，验证静态资源和 Expo Router 依赖可解析。

建议额外运行：

```bash
npx expo-doctor
git diff --check
```

连接恢复改动还应在已连接 Android 真机上执行：

```bash
npm run verify:android:recovery
```

脚本会覆盖启动、锁屏/唤醒、网络切换与 logcat 错误扫描，原始结果写入 `.local/verification-raw/`，不会提交到 Git。

## 10. 新代码检查清单

新增模块前确认：

1. 它属于单一 feature，还是确实被多个 feature 共享？
2. 跨 feature 能力是否已通过目标 `index.ts` 暴露？
3. hook/model 是否错误依赖了组件？
4. API 类型是否从窄入口导入？
5. 网络请求是否具备取消、超时、错误归一化与资源清理？
6. 新增用户文本是否同步所有 locale？
7. 非显然的状态语义是否有中文注释？
8. 纯逻辑是否可以从组件中提取并单测？
