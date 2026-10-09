# 顶部工作状态头像

聊天页顶部的头像与状态胶囊共用同一个 `HeaderActivity.phase`，因此二者的状态一定同步：

```text
thinking / waiting / tool / file / replying / done / error / idle
```

当前实现位于：

```text
src/features/chat/components/HeaderAvatar.tsx
```

## 当前行为

当前已经放入一组临时占位动图，用现有 `nanobot-icon.png` 生成，专门用于先验证“顶部头像跟随工作状态”的视觉链路：

```text
assets/images/header-avatar/idle.gif
assets/images/header-avatar/thinking.gif
assets/images/header-avatar/waiting.gif
assets/images/header-avatar/tool.gif
assets/images/header-avatar/file.gif
assets/images/header-avatar/replying.gif
assets/images/header-avatar/done.gif
assets/images/header-avatar/error.gif
```

这些占位动图的动作分别为：

- `idle`：极轻微上下浮动
- `thinking`：轻微呼吸、上下浮动与小幅摇摆
- `waiting`：慢速呼吸
- `tool`：节奏稍快的摇摆
- `file`：轻微上下跳动
- `replying`：左右轻摆
- `done`：短促弹跳循环
- `error`：左右抖动循环

它们仍然由 React Native 的 `Image` 渲染，不区分 Android、iOS 或 Web 平台。

## 后续替换动态图

如果后续拿到正式的小企鹅敲电脑素材，直接替换 `assets/images/header-avatar/` 下的同名 GIF 即可；`HeaderAvatar.tsx` 不需要再改。

推荐素材规则：

- 方形画布；
- 输出尺寸至少 148px（对应 49pt 的 3 倍图）；
- 透明背景优先使用 GIF；
- 循环动画不要有明显首尾跳变；
- 单个文件尽量控制在几十 KB 级别，避免拖慢启动。

## 后续替换短视频

短视频素材也已预留渲染通道。将对应状态改成 `video` 即可：

```ts
tool: { kind: 'video', source: require('.../penguin-typing.mp4') },
```

视频默认：

- 静音；
- 循环；
- 隐藏控制按钮；
- 不拦截父级头像区域的点击，仍会打开 Agent Activity；
- 不再叠加占位位移/缩放动画，避免与素材自身动作冲突。

短视频建议使用标准 MP4。若需要透明背景，优先考虑 GIF；不同平台对透明视频的支持不一致，不建议把透明依赖放在短视频方案里。

## 验证

新增 Native 测试：

```text
__native_tests__/features/chat/header-avatar.test.tsx
```

该测试覆盖全部 8 个状态，确认当前默认渲染图片素材；同时会用桩素材验证 `video` 分支，防止后续改动破坏短视频接入路径。
