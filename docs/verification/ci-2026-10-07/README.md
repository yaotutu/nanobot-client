# Android 开发版自动发布验证（2026-10-07）

## 推送前本地验收范围

- 工作流：`.github/workflows/android-development-release.yml`。
- 验证 main 推送触发、开发版元数据、现有 Release 脚本复用与发布命令。
- 以下记录为首次推送前的本地验收，不包含远端 Release。云端 runner 的结果以提交推送后的实际 Actions 日志与 Release 产物为准，不把本地构建等同于 GitHub Actions 已成功运行。

## 已通过

- `npm run check`：ESLint、TypeScript、184 个 Vitest 测试、92 个 Native Jest 测试、Android bundle smoke。
- 元数据脚本新增 11 个测试，覆盖三份版本文件同步、首次构建、后续构建、重试、非法参数和基础版本不一致；测试不会修改仓库版本。
- `actionlint`（包含 ShellCheck）：工作流无错误；确认只监听 main 推送、保留手动触发且跳过非 main 分支。
- 模拟 `gh` 执行工作流原始发布脚本：完整 SHA 被传入 `--target`，APK 与校验文件先上传到草稿，之后才公开 Prerelease，且不设为 Latest；Summary 正常生成。
- 干净临时工作区执行 `npm ci` 成功；不包含本机开发密码或已生成的 Android 工程。
- 临时工作区生成 Android 工程，确认 `versionName=1.0.6-dev.42.1`、`versionCode=4201`；重新生成的开发 keystore 与当前本机 keystore 的 SHA-256 相同。

## 实际 APK 构建与校验

- 干净临时工作区运行 CI 的元数据脚本，再执行 `npm run release -- --no-version --local-only --skip-check`，退出码 0。
- Gradle：`BUILD SUCCESSFUL in 18m 47s`，944 个任务执行；这是本机无原生输出缓存的构建耗时，不代表 GitHub runner 耗时。
- 产物：`nanobot-v1.0.6-dev.42.1.apk`（约 109 MB）与 `checksums.txt`，已保留在忽略目录 `.local/verification-raw/ci/apk/`；临时工作区随后清理。
- `aapt dump badging`：包名 `com.anonymous.nanobotclient`，版本 `1.0.6-dev.42.1`，版本码 `4201`，minSdk 24、targetSdk 36。
- APK 包含 `arm64-v8a`、`armeabi-v7a`、`x86`、`x86_64` 四种架构。
- `apksigner verify --print-certs` 通过，使用 Android Debug 开发证书；`shasum -a 256 -c checksums.txt` 通过。
- 未安装到设备、未改变当前项目的原生工程或仓库基础版本、未上传测试 Release。

## 其他观察

- GitHub API 只读核对：当前仓库 Actions 已启用；默认 token 只读，工作流发布 job 显式请求 `contents: write`。
- 干净安装报告现有依赖有 68 项审计告警（9 moderate、58 high、1 critical）。此次未新增依赖，未混入依赖升级；审计告警应另行处理，不影响本次 `npm ci` 的退出状态。
- 原始校验／构建日志保存在忽略目录 `.local/verification-raw/ci/`，不提交设备或环境原始日志。

## 首次云端运行发现并修复（2026-10-07）

- main 推送已触发运行 `37578715813`，提交 `34833f5`；Node／Java／Android SDK 初始化成功。
- Gradle 缓存初始化失败：干净检出没有 `android/`，缓存 Action 无法匹配 Gradle 文件。此轮没有构建或发布 APK。
- 修复为完整检查和临时版本生成后先执行 Expo Prebuild，再初始化 Gradle 缓存。现有 Release 脚本仍保留原生同步，避免改变本地打包契约。
- 新增工作流执行顺序回归测试，防止本地已有原生目录掩盖此类干净 runner 的问题。
- 原始失败日志保存在忽略目录 `.local/verification-raw/ci-cloud-2026-10-07/failed-37578715813.log`；修复后的结果以最新 Actions 运行与公开 Release 为准。
