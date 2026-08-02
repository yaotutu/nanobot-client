# Android Release 打包与发布

本文记录 `nanobot-client` 的 Android 本地打包和 GitHub Release 发布流程。

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
