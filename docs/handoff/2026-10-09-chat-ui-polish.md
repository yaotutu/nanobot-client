# 2026-10-09 聊天页 UI 精修交接文档

## 1. 交接背景

本轮修改的目标是把聊天页从「功能可用」推进到「视觉更完整、更精致」，重点对齐用户提供截图中的设计感受：中性、克制、空间利用率高、信息密度合理。

本轮只借鉴参考 UI，不引入其业务逻辑或接口，也继续保持 Android / iOS / Web 一套 React Native UI。

### 本轮明确的 UI 方向

- 顶部区域改为真正的悬浮层：左侧会话入口、中央头像 + 状态胶囊、右侧当前会话设置入口。
- 去掉旧顶部的品牌大标题、副标题和大块背景，让正文可利用更多屏幕空间。
- 消息气泡统一圆角和暖色中性配色，减少组件拼接感。
- 输入框改为无描边的一体化胶囊。
- 「下面还有消息」入口改为右下角悬浮按钮，不再占据正文布局空间。
- 新消息提示不展示未读数量，只表达「可回到下方 / 底部」。

## 2. 当前工作区状态

- 分支：`main`
- 最近一次提交：`c02e57c build: publish split Android APKs with universal package`
- 当前有 21 个未提交文件，均属于本轮聊天页 UI 精修。
- 本文档新增后暂未提交；用户当前要求是生成本地交接文档，因此不要擅自 commit / push。

修改范围：

```text
src/features/chat/components/ChatHeader.tsx
src/features/chat/components/HeaderActivityPill.tsx
src/features/chat/components/ChatThread.tsx
src/features/chat/components/Composer.tsx
src/features/chat/components/ComposerInputRow.tsx
src/features/chat/components/composer-styles.ts
src/features/chat/components/messages/MessageRow.tsx
src/features/chat/ui/chat-theme.ts
src/features/chat/components/ChatSurface.tsx

__native_tests__/features/chat/chat-layout.test.tsx
__native_tests__/features/chat/chat-thread.test.tsx

src/i18n/locales/*/common.json
docs/handoff/2026-10-09-chat-ui-polish.md
```

## 3. 已完成的主要调整

### 3.1 顶部悬浮入口

文件：

```text
src/features/chat/components/ChatHeader.tsx
src/features/chat/components/HeaderActivityPill.tsx
```

核心变化：

- 不再展示常驻的 `nanobot` 品牌大标题和副标题。
- 顶部保留三个入口：
  - 左侧：会话抽屉按钮，44×44。
  - 中央：动态头像 + 活动状态胶囊。
  - 右侧：当前会话的聊天选项按钮，44×44。
- 头像外层圆形底座为 80×80，实际头像尺寸 72，底色 `#FFF5E4`。
- 胶囊固定高度 30，并通过 `marginTop: -8` 与头像贴合。
- 空闲时胶囊显示品牌名；工作时显示当前工作状态。
- 空闲与工作状态切换时不会引起顶部高度跳动。

新增测试 ID：

```text
header-avatar-frame
header-activity-pill
```

值得注意：AGENTS.md 已更新为「ConversationSheet 从左侧滑入」，当前交互同样是左上角按钮打开左侧会话抽屉。

### 3.2 消息页配色体系

文件：

```text
src/features/chat/ui/chat-theme.ts
```

浅色模式改为暖色中性体系：

```text
background: #FAF9F6
foreground: #25231F
card: #F0EEEA
pressed: #E5E1D9
userBubble: #F1DDB9
userText: #493211
```

深色模式对应调整为：

```text
background: #101010
foreground: #F3F2EF
card: #242424
pressed: #33312E
userBubble: #98651B
userText: #FFF8EB
```

布局常量：

```ts
export const chatLayout = {
  maxWidth: 760,
  horizontalInset: 14,
  controlSize: 44,
  headerHeight: 104,
} as const;
```

解释：

- `horizontalInset: 14` 用于提高正文可用宽度。
- `headerHeight: 104` 是悬浮头部高度；它没有从消息列表中直接扣除，而是作为反向列表的顶部滚动余量使用，让最旧一条消息可以完整滚到悬浮头像下方。

### 3.3 消息列表空间利用率

文件：

```text
src/features/chat/components/ChatThread.tsx
```

调整内容：

- 左右边距由 17 收紧到 14。
- 消息间距由 13 收紧到 10。
- 反向 FlatList 的 `paddingBottom` 设置为 `chatLayout.headerHeight + 12`。
  - React Native inverted 列表中，`paddingBottom` 对应视觉顶部。
  - 这样最早一条消息可以完整滚动到头像下方。
  - 最新消息仍在视觉底部，不会被头部常驻遮挡。

### 3.4 下方消息入口改为悬浮按钮

文件：

```text
src/features/chat/components/ChatThread.tsx
__native_tests__/features/chat/chat-thread.test.tsx
```

旧交互：

- 「Latest messages」胶囊居中显示。
- 占据消息区和输入框之间的一行布局。
- 有完整可见文字。

新交互：

- 只在消息区右下角显示 44×44 悬浮圆形按钮。
- 按钮内只有一个向下箭头。
- 样式：

```text
position: absolute
right: 14
bottom: 12
width: 44
height: 44
borderRadius: 22
```

- 背景使用 `colors.userBubble`，图标使用 `colors.userText`。
- 点击后平滑回到底部。
- 不展示未读数量；`atBottom === false` 时显示，回到底部后隐藏。

已覆盖的测试点：

- 不占布局空间。
- 无可见文字。
- 点击回到底部。
- 到底隐藏。
- 离底重新显示。
- 明暗主题配色。

### 3.5 消息气泡与低频操作区

文件：

```text
src/features/chat/components/messages/MessageRow.tsx
```

#### 气泡

助手消息：

- 最大宽度从 95% 改为 100%。
- 圆角 24，左下角 8。
- 内边距 15。
- 背景色 `colors.card`。

用户消息：

- 最大宽度 88%。
- 圆角 24，右下角 8。
- 保留暖色强调。

#### 操作区

旧逻辑：

- 复制、引用、分支、重试默认全部展示。

新逻辑：

- 默认只显示一个低调节的 `...` 按钮。
- 点击 `...` 或长按气泡后展开具体操作。
- 再次点击可收起。
- 流式回复中不显示操作按钮。

新增状态：

```ts
const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
```

这个状态按消息 ID 记录，FlatList 行复用时不会把上一条消息的展开状态带到下一条。

新增气泡测试 ID：

```text
message-bubble-${message.id}
```

### 3.6 输入区视觉简化

文件：

```text
src/features/chat/components/Composer.tsx
src/features/chat/components/ComposerInputRow.tsx
src/features/chat/components/composer-styles.ts
src/features/chat/components/ChatSurface.tsx
```

调整内容：

- 输入框整体改为一块无描边背景。
- 去掉边框、阴影和 focus 描边。
- 圆角 29，输入行高度 58。
- 附件按钮不再保留独立底板。
- 发送按钮：
  - 空闲时透明。
  - 可发送时使用 `colors.userBubble`。
  - 停止按钮同样使用统一强调色。
- 文本选择色改为 `colors.accentText`。
- `Composer` 不再维护局部 `focused` state，减少视觉状态和组件复杂度。

### 3.7 i18n

新增 key：

```text
message.actions
```

已同步到全部 10 个语言文件：

```text
en
es
fr
id
ja
ko
pt-BR
vi
zh-CN
zh-TW
```

## 4. 验证状态

### 4.1 已通过

TypeScript：

```bash
npm run typecheck
```

结果：通过。

目标 Native 测试：

```bash
npm run test:native -- \
  --runTestsByPath \
  __native_tests__/features/chat/chat-layout.test.tsx \
  __native_tests__/features/chat/chat-thread.test.tsx \
  __native_tests__/features/chat/header-avatar.test.tsx
```

结果：

```text
3 个测试套件通过
35 个测试通过
```

### 4.2 未完成

以下检查尚未完成或被中断：

```bash
npm run lint
npm run check
```

`npm run lint` 曾启动过一次，但命令被中断，未拿到最终结果。

### 4.3 模拟器视觉验证

原始验证数据位于：

```text
.local/verification-raw/chat-polish-2026-10-09/
```

当前已有：

```text
first.png
first.xml
input.xml
```

已完成：

- Android 模拟器 `emulator-5554` 启动过。
- 应用包：`com.anonymous.nanobotclient`。
- 执行过 `adb reverse tcp:8081 tcp:8081`。
- 首次截图和 UI dump 中确认：
  - 顶部只有会话入口、Agent Activity、Chat options。
  - 中央显示 `nanobot`。
  - 旧副标题已消失。
  - 输入框、附件、发送按钮可见。
- 已尝试输入较长测试 prompt，输入状态 dump 到 `input.xml`。

尚未完成：

- 确认 `input.xml` 中输入框是否确实包含测试文本。
- 点击发送并等待真实流式回复。
- 截图浅色长消息页面。
- 截图深色模式。
- 验证右下角悬浮按钮的实际遮挡关系。
- 长按或点击 `...` 验证操作区展开。
- 根据真实截图继续微调。

交接时 `expo run:android` 进程已不在运行。

## 5. 遗留整理点

`src/features/chat/components/messages/MessageRow.tsx` 中有两个相邻且互斥的 copy 条件：

```tsx
{showUserCopy ? <MessageCopyButton ... /> : null}
{showAssistantActions ? <MessageCopyButton ... /> : null}
```

功能正确，但代码冗余。建议整理为：

```tsx
{(showUserCopy || showAssistantActions) ? (
  <MessageCopyButton ... />
) : null}
```

此外，助手消息完成时间 `completedAtLabel` 目前展示在默认 meta 行。是否继续保留，建议等真实长消息截图后再决定；如果仍觉得占空间，可以移到展开操作区中。

## 6. 接手后的建议顺序

1. 清理 `MessageRow.tsx` 中重复的复制按钮条件。
2. 检查 `.local/verification-raw/chat-polish-2026-10-09/input.xml` 中的输入状态。
3. 继续模拟器验证：
   - 发送长 prompt。
   - 观察流式输出。
   - 验证消息气泡宽度。
   - 验证顶部头像、胶囊和左右按钮。
   - 验证右下角悬浮按钮。
   - 验证消息操作展开。
   - 截浅色 / 深色截图。
4. 根据截图继续做少量视觉微调，不要仅依赖样式测试。
5. 执行 lint。
6. 执行完整检查：

   ```bash
   npm run check
   ```

7. 用户明确要求提交后，再执行 commit 和 push。不要提前提交。

## 7. 提交与发布约定

根据当前 AGENTS.md：

- `npm run check` 必须通过。
- 原始截图和设备日志留在 `.local/verification-raw/`，不直接提交。
- 不提交 `android/`、`ios/`、`dist/`、`release-assets/`、`expo-env.d.ts`、`src/services/credentials/dev-secret.ts`。
- 用户要求「提交代码」时，本地 commit 成功后必须自动 push 当前跟踪分支。
- `main` 分支 push 后，GitHub Actions 会自动执行云端构建和 Android Release 发布。

## 8. 接手后的补充记录

> 本节为 2026-10-09 继续接手后的最新状态；上文第 4-6 节中标记“未完成”的内容已按本节更新。

### 8.1 代码整理

已将 `MessageRow.tsx` 中相邻且互斥的用户／助手复制按钮条件合并为一个条件，行为不变，删除冗余渲染分支。

真实长消息截图中，`completedAtLabel` 只占用一行低调元信息，未与气泡或操作按钮冲突；本轮保留在默认 meta 行。

### 8.2 模拟器与真实流式验证

已启动后端网关与 Metro，并在 Android 模拟器中发送真实长 prompt，得到包含三个标题、编号列表和 Python 代码块的流式回复。

验证结果：

- 输入框可正确接收长文本，并随输入从单行扩展。
- 发送后顶部胶囊从 `nanobot` 切换为 `Thinking`，输入区切换为「Stop response」。
- 流式完成后顶部切回 `nanobot`，`...` 操作入口和时间戳显示正常。
- 长回复的标题、编号列表和代码块渲染完整。
- 离底后右下角 44×44 悬浮按钮出现；点击后平滑回到底部，到底后隐藏，不占列表布局空间。
- `...` 展开后显示复制、引用、分支、重试；再次点击可收起。
- 浅色／深色模式下头部、用户／助手气泡、输入框和悬浮按钮配色均与 `chat-theme.ts` 设计值对应。
- 悬浮头部高度与反向列表顶部余量配合正常，旧消息可以滚动到头像下方，最新消息不被头部遮挡。

原始验证数据仍保留在：

```text
.local/verification-raw/chat-polish-2026-10-09/
```

清洗后的证据在：

```text
docs/verification/chat-polish/2026-10-09/
```

其中提交浅色空会话、浅色流式、浅色长回复、浅色操作展开、深色长回复五张截图及说明。原始两张疑似包含个人内容的截图已被重新拍摄的通用演示内容替代，当前提交证据不含旧会话个人内容。

### 8.3 检查结果

已通过：

```bash
npm run lint
npm run check
```

`npm run check` 覆盖：

- ESLint
- TypeScript
- Vitest：40 个测试文件、346 个测试
- Native 测试
- Android Metro bundle smoke

目标 Native 测试再次确认 3 个套件、35 个测试通过。

`npx expo-doctor` 执行结果为 20/21 项通过，剩余一项是 Expo SDK 57 相关依赖存在较新的 patch 版本（例如 Expo、expo-router、react-native patch 更新）。这不是本轮 UI 变更引入的问题；由于会波及依赖锁文件并可能要求重新原生构建，本轮未顺手升级。

### 8.4 当前剩余事项

- 代码、测试和截图证据已完成，本交接记录随本轮聊天 UI 精修提交一起入库；提交后按项目约定推送 `main`。
- `expo-doctor` 的 SDK patch 依赖升级可以单独开一轮处理，不建议混入本轮 UI 精修提交。

### 8.5 收尾记录

- 根据用户反馈，聊天页不应整体改成暖米色／琥珀色系；已完整恢复原 nanobot 冷色调色板，并保留悬浮头部、布局、消息操作与滚动交互改动。

- 已人工检查提交用验证截图。首次整理时疑似含个人内容的两张截图未直接提交；后使用通用演示 prompt 重新拍摄，当前五张截图均不含旧会话个人内容。
- 已将 Android 模拟器中的应用内主题从 `Dark` 恢复为 `Light`，随后关闭应用，避免后续验证时的状态残留。
- 已检查 nanobot 服务端仓库：没有已跟踪文件改动；测试网关产生了一批未跟踪的 agent 运行文件和目录（如 `HEARTBEAT.md`、`USER.md`、`memory/` 等）。这些属于服务端工作区，不由本轮客户端 UI 提交处理。

### 8.6 主题结构拆分

根据用户确认，已执行第一阶段主题抽取，保持用户可见行为完全不变：

- 新增 `src/features/theme/`，集中定义 `ThemeMode`、`ThemeId`、`ThemeDefinition` 与内置 nanobot 主题。
- 一个主题同时声明全局界面颜色和聊天界面颜色，当前分别沿用原有取值；后续新增主题时不会把设置页和聊天页强行绑成同一套 Palette。
- 新增 `resolveAppPalette`、`resolveChatPalette`、`resolveThemeDefinition`，未知主题 ID 会回落到 nanobot，保证界面始终有可用颜色。
- `src/ui/colors.ts` 的全局颜色定义已并入 theme feature；`Palette` 类型仍保留在 `src/ui/palette.ts`。
- 聊天布局尺寸从颜色文件中移出，改为独立的 `src/features/chat/ui/chat-layout.ts`。主题不包含字体、间距、头部高度、消息宽度等布局信息。
- 删除 `src/features/chat/ui/chat-theme.ts`，`chat screen` 不再暴露主题解析职责。
- 新增 `__tests__/theme.test.ts`，锁定全局色／聊天色的独立性、明暗解析和未知主题 fallback。

纯结构重构后已通过 `npm run check`：ESLint、TypeScript、Vitest 41 个文件 348 个测试、Native 17 个套件 164 个测试、Android Metro bundle smoke。
