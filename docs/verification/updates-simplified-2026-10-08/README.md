# 应用内更新简化重构验收（2026-10-08）

## 本次实现

- 一份 Latest Release 平铺清单，一次 GET；远端整数 versionCode 大于本机时才允许更新。
- CI 按基数 201 + GITHUB_RUN_NUMBER 生成版本；rerun 恢复同一版本，不递增 attempt。
- 删除旧清单、标签推算、Release 分页、SDK 版本筛选、更新元数据持久化和指数退避。不迁移旧更新缓存。
- 保留手动更新、进度、取消、文件大小与 SHA-256 校验、私有 APK 缓存及系统安装确认。
- 普通开发用途 Release 完整上传三个资产后设为 Latest；手动发布不含清单，显式排除 Latest。

## 本地自动化结果

| 检查 | 结果 |
| --- | --- |
| npm run check | 退出码 0，完整通过 |
| ESLint / TypeScript | 通过 |
| Vitest | 38 个文件、319 项通过 |
| Native Jest | 10 个套件、119 项通过 |
| Android bundle smoke | 成功导出 Hermes bundle（1735 modules） |
| actionlint | 通过 |
| 发布脚本 node --check / release.sh bash -n | 通过 |
| git diff --check | 通过 |

测试覆盖：整数相等/更低禁止安装、旧清单拒绝、单次固定请求、404/错误/超时/限流、请求合并与固定节流、候选冻结、取消后禁止安装、下载和安装前真实分块哈希、坏文件清理、进程重启重新检测、设置导航/蓝点/进度、前后台生命周期，以及发布脚本实际生成结果可被客户端真实解析器接受。

CI shell 通过假 gh 命令执行验收：草稿完整上传才公开，同 tag 已公开则跳过，半成品草稿重建，main 变化和查询/上传错误均不公开。没有调用真实 GitHub 发布。

首次检查发现 CI 测试正则 lint 与旧 UI 版本 fixture 不一致，已修复；最终完整检查通过，不将失败的中间记录算作最终验收。

提交前整理仅调整代码可读性、函数装配和中文注释，不增加功能或恢复历史兼容。2026-10-08 重新运行完整 `npm run check`，退出码 0。

最新原始本地日志位于 `.local/verification-raw/updates-final-2026-10-08/`，不提交构建产物或原始日志。

## 未完成的上线验收（不能据本页声称已通过）

- 未提交或推送本次重构，未触发云端构建／发布。
- 未重新执行本次重构的完整 Android Gradle APK 构建或模拟器覆盖安装。此前设备下载/安装器验收属于旧实现，不能替代新流程的端到端升级。
- 上线后仍需先安装包含新更新器的 Release A，再发布更高 versionCode 的 Release B，验证发现、下载、确认覆盖安装、重启版本及数据保留。
- 需要 Android Release APK 验收；Metro 模式禁止安装，iOS/Web 不使用 APK 更新。

实现与发布约定见 `docs/in-app-updates.md` 和 `docs/android-release.md`。
