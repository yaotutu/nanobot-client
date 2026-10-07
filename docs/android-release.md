# Android Release 打包与发布

本文记录 `nanobot-client` 的 GitHub Actions 开发版自动发布，以及 Android 本地打包发布流程。

## GitHub Actions 开发版自动发布

工作流：`android-development-release.yml`（`.github/workflows/`）。

### 触发与执行流程

- 推送到 `main` 自动运行，包括合并 PR 后产生的推送；其他分支和 tag 不触发发布。
- 可在 GitHub → Actions → **Android Development Release** → **Run workflow** 手动触发，分支需选择 `main`；选其他分支会跳过任务。
- 每次推送独立构建，不取消较早的构建。发布失败可用 **Re-run jobs** 重试。
- 云端使用 Ubuntu 24.04、Node.js 24、JDK 17、Android SDK 36、NDK 27.1.12297006 和 CMake 3.22.1，缓存 npm / Gradle 依赖；不修改本机开发环境。
- 依次执行 `npm ci` → `npm run check` → 生成临时开发版元数据 → 复用 `release.sh --no-version --local-only --skip-check` 构建 APK → 上传 Actions Artifact → 发布 GitHub **Prerelease**。
- lint、类型检查、单元测试、Native 测试或 Android bundle smoke 任意一项失败，都不会发布。
- APK 和 `checksums.txt` 先上传至 Release 草稿，再公开；发布失败时已成功上传的 Actions Artifact 仍可下载，保留 14 天。

### 版本与源码追踪

例如仓库基础版本 `1.0.6`，工作流第 42 次运行、第一次尝试：

```text
应用版本：1.0.6-dev.42.1
Android versionCode：4201
Release tag：dev-42.1-<提交 SHA 前 7 位>
APK：nanobot-v1.0.6-dev.42.1.apk
```

- `scripts/prepare-ci-release.mjs` 只修改 runner 的临时 `package.json`、`app.json`、`package-lock.json`；不提交版本、不推送代码，不形成触发循环。
- tag 明确指向该次构建的完整 `github.sha`，即使构建期间 main 又有新提交，也不会指错源码。
- 同一次运行重试时版本后缀变为 `dev.42.2`，版本码变为 4202；新运行的版本码更大。尝试编号支持 1–99。
- 不覆盖正式版 `vX.Y.Z` tag，不将开发版设为正式版的 **Latest**；从仓库 **Releases** 列表或对应 Actions 的 Summary 下载。
- 工作流运行编号用于覆盖安装，避免删除工作流后重建导致编号重置。旧构建重跑仍是旧编号，不能当作更新包覆盖安装到更高版本码的 APK。

### 权限、签名与登录

- 仅使用 GitHub 提供的 `GITHUB_TOKEN`；工作流已声明 `contents: write`，不需要新增 PAT、EAS 账号或登录 GitHub CLI。
- 将工作流提交并推送到 main 即可启用；如果仓库或组织禁用了 Actions／限制 token 写权限，需要在 GitHub 对应设置中允许。首次云端构建仍需以实际 Actions 日志为准。
- 继续使用当前 Expo Android 模板的开发 keystore，为 **Release 模式构建 + 开发签名**，仅适合开发测试，不作为应用商店正式签名方案。覆盖安装要求包名和签名一致，并且版本码不低于设备上已有版本；本地脚本默认版本码与 CI 不同步，混用本地包时需注意。
- APK 默认连接 `http://192.168.55.201:8765`；云端不尝试访问局域网。安装后需处于可访问该网关的网络中，在登录页面输入密码。
- 现有打包脚本会清空开发凭据，不会将本机 `dev-secret.ts` 或网关密码打包。
- 本次仅自动发布 Android APK，不包含 iOS 或 Web。

## 打包范围

发布脚本只处理 Android Release APK：

- 不导出 Web；
- 不生成 Web `dist/`；
- 只使用当前本地工作区的代码构建 APK；
- 不检查 Git 工作区、分支、远程同步状态；
- 不执行 `git add`、`git commit`、`git push`、`git pull` 或其他 Git 同步操作；
- 默认创建 GitHub Release，并上传当前本地构建出来的 APK 和校验文件。

GitHub Release 的 tag 由版本号生成，例如 `package.json` 为 `1.0.5` 时使用 `v1.0.5`。脚本上传的 APK 来自本次本地构建，不要求本地代码已经提交或同步。

## 一条命令完成打包发布

先登录 GitHub CLI（只需首次执行，或登录失效后重新执行）：

```bash
gh auth login
```

日常直接运行：

```bash
npm run release
```

该命令会依次：

1. 自动将 patch 版本号加一；
2. 同步更新 `package.json`、`app.json` 和 `package-lock.json` 的版本号；
3. 运行 `npm run check`；
4. 增量准备 Android 原生工程；
5. 使用 Gradle 构建 Android Release APK；
6. 生成 APK 和 SHA-256 校验文件；
7. 创建对应的 GitHub Release；
8. 通过 GitHub 上传 API 覆盖同名资产并上传 APK 和 `checksums.txt`；网络失败时自动重试。

发布成功后，终端会打印 GitHub Release 地址。

## 常用命令

### 依赖安装

发布命令默认复用现有的 `node_modules`，不会每次重新安装依赖。第一次使用或依赖发生变化时，先手动执行一次：

```bash
npm ci
```

然后继续使用同一个发布命令。

### 只构建，不上传 GitHub Release

```bash
npm run release -- --local-only
```

### 不修改版本号

```bash
npm run release -- --no-version
```

### 指定版本类型或版本号

```bash
npm run release -- minor       # 1.0.5 -> 1.1.0
npm run release -- major       # 1.0.5 -> 2.0.0
npm run release -- v1.2.0      # 使用 1.2.0
```

### 跳过代码检查

不建议日常使用；仅用于已经单独执行过检查、需要快速出包的场景：

```bash
npm run release -- --skip-check
```

## 构建缓存

日常打包不会使用 `expo prebuild --clean`，也不会删除 `android/` 工程；Gradle daemon 保持启用，因此会复用 Gradle 的增量编译和缓存。

第一次构建通常较慢，后续没有变化的任务会被 Gradle 标记为 `UP-TO-DATE`，只编译发生变化的部分。

## 什么时候清理 Android 原生工程

只有在以下情况使用完整清理：

- 修改了 Expo config plugin；
- 增加、删除或升级原生依赖；
- 修改了 Android 原生配置；
- Gradle 出现明显的缓存或工程状态错误。

命令：

```bash
npm run release -- --clean-native
```

该选项会删除并重新生成 Android 原生工程，下一次构建会明显变慢。

## 输出文件

本地文件位于：

```text
release-assets/vX.Y.Z/
├── nanobot-vX.Y.Z.apk
└── checksums.txt
```

`android/`、`release-assets/` 等生成内容不应提交到 Git。脚本不会替你提交这些文件；Git 是否同步不影响本地构建和 APK 上传。

## 环境要求

Android Release 构建需要：

- Node.js 和 npm；
- JDK 17；
- Android SDK Platform 36；
- Android Build-Tools 36.0.0；
- Android SDK Platform-Tools；
- `ANDROID_HOME` 环境变量；
- GitHub CLI `gh`，并已执行 `gh auth login`（仅默认发布到 GitHub 时需要）；
- `curl`（仅默认发布到 GitHub 时需要）。

macOS 示例：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```
