# Android 应用内更新

## 核心规则

每次 main 的新构建使用更大的整数 `versionCode`。客户端只请求一份 Latest Release 的 `update.json`：

`https://github.com/yaotutu/nanobot-client/releases/latest/download/update.json`

当远端 `versionCode > 本机原生 versionCode` 时提示更新。相等或更低都不能安装。不比较展示版本字符串，不解析发布标签，不遍历 Release，也不回退到历史版本。

> Latest Release 在 GitHub 中发布为非 prerelease，但仍是开发用途 APK，使用固定开发签名，不代表商店正式版。

## 用户操作

- 会话面板「设置」→「应用」→「更新」。有新版本时显示蓝点，不打断聊天。
- 启动、回到前台、持续前台每 10 分钟静默检查；自动检查成功和失败均按固定间隔节流。应用被关闭后不后台监测。
- 「检查更新」可立即检查；GitHub 明确限流时手动检查也必须等待。
- 「下载并安装」由用户触发。显示进度、支持取消，下载完成后不做哈希校验，直接打开 Android 系统安装器；安装由用户确认。
- 若系统阻止未知来源安装，在更新页点击「允许安装」，授权后返回点击「安装更新」。
- 关闭设置页不取消下载；取消下载不安装、不保留半包。取消系统安装可重新点击安装。
- 下载器成功返回后立即打开安装器；APK 结构与签名由 Android 系统安装器校验。系统返回不等于更新成功，重启后读取原生版本码确认。
- 进程重启重新检查更新信息，不保存或迁移历史更新元数据。已存在的本轮整数版本缓存文件可直接复用，不承诺断点续传。
- 保持包名和签名不变，覆盖安装不会主动清除登录和本地偏好。

## 发布约定

- 只使用公开仓库 `yaotutu/nanobot-client`，与 nanobot 网关、登录状态无关，无需 GitHub token。
- 版本码为 `app.json 的 android.versionCode 基数 + GITHUB_RUN_NUMBER`。基数为 201；新包从更高版本码开始，每个新工作流运行增 1，失败允许跳号。重跑同一 run 是恢复同一版本，不再增加版本码。
- 展示版本为 `<基础版本>-dev.<versionCode>`，标签为 `dev-<versionCode>`；云端临时版本不回写仓库。
- CI 在发布前验证实际 universal APK 的版本、包名与固定签名，并计算大小、SHA-256。将五个 APK、checksums.txt、update.json 上传到草稿后，一次公开并设为 Latest。
- 只保留最新 main 构建，发布前确认 main 仍指向当前提交，避免旧构建抢 Latest。已公开的同版本不覆盖。

唯一清单格式（示例）：

```json
{
  "version": "1.0.6-dev.204",
  "versionCode": 204,
  "apkUrl": "https://github.com/yaotutu/nanobot-client/releases/download/dev-204/nanobot-v1.0.6-dev.204-universal.apk",
  "size": 114744661,
  "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "publishedAt": "2026-10-08T00:00:00Z",
  "notes": "改进聊天体验"
}
```

应用内更新固定下载 universal 包，不在客户端判断 CPU ABI；手动下载 Release 中的对应架构包可以减少体积。上述大小、哈希和时间仅是格式示例，实际值由发布脚本生成。当前客户端不校验 `sha256`；该字段暂时保留给已发布的旧版客户端，避免它们无法跨到本版本。客户端只验证必要字段与本仓库 HTTPS APK 地址；旧的嵌套清单不支持。

清单未发布时 404 表示暂无可用更新；其他网络/协议错误明确显示，并保留进程内已发现的更新提示，不伪装成最新版。详见 [Android 发布说明](android-release.md)。

## 验收边界

1. 手动安装首个包含新更新器的 Release APK。旧客户端不能凭空获得更新功能。
2. 后续提交到 main，确认构建完成并将五个 APK、checksums.txt 和 update.json 发布为 Latest。
3. 首包检查发现更高 versionCode，下载完成后直接确认覆盖安装。
4. 重启核对新原生版本以及登录、主题、语言数据；同时测试离线、取消下载、拒绝授权和取消系统安装。

Metro 开发模式可检测，但禁用 APK 下载/安装；iOS/Web 不请求 APK 更新。无 Expo OTA/EAS、常驻服务、后台推送或 nanobot 更新接口。

## 代码边界

- `model.ts`：平铺清单与必要字段校验。
- `release-api.ts`：一次 Latest 请求，超时与明确限流。
- `store.ts`：整数比较、内存状态、合并请求、固定节流、下载取消和版本冻结。
- `download.ts`：私有文件缓存、系统安装和授权跳转；下载完成后不做哈希校验。
- `hooks.ts`：前台检查生命周期，独立于网关与鉴权。
- `components/UpdateDetails.tsx`：设置页更新详情及用户操作。
