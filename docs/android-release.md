# Android Release 打包与发布

本文记录 `nanobot-client` 的 GitHub Actions 开发版自动发布，以及 Android 本地打包发布流程。

## GitHub Actions 开发版自动发布

工作流：`android-development-release.yml`（`.github/workflows/`）。

### 触发与执行流程

- 推送到 `main` 自动运行，包括合并 PR 后产生的推送；其他分支和 tag 不触发发布。
- 可在 GitHub → Actions → **Android Development Release** → **Run workflow** 手动触发，分支需选择 `main`；其他分支会跳过任务。
- main 发布 job 使用固定并发组 `android-development-release-main`，`cancel-in-progress: true` 取消旧运行，只保留最新运行。非 main 手动运行不进入这个 job，不会取消正在执行的 main 发布。
- 云端使用 Ubuntu 24.04、Node.js 24、JDK 17、Android SDK 36、NDK 27.1.12297006 和 CMake 3.22.1，缓存 npm / Gradle 依赖；不修改本机开发环境。
- 依次执行 `npm ci` → `npm run check` → 生成临时版本 → Expo Prebuild → 初始化 Gradle 缓存 → 复用 `release.sh --no-version --local-only --skip-check` 构建 APK → 验证实际 APK 并生成 `update.json` → 上传 Actions Artifact → 检查 main 与同 tag Release → 创建草稿、上传三个资产 → 复查 main → 公开并设为 **Latest**。
- lint、类型检查、单元测试、Native 测试、Android bundle smoke 或 APK 验证任意一项失败，都不会公开 Release。Actions Artifact 保留 14 天，发布失败后仍可下载已保存的构建产物。
- Release 使用 **普通 Release**（`prerelease: false`），不是 Prerelease：固定 `latest/download/update.json` 入口需要 Latest 的普通 Release。标题、Release 备注和清单 notes 仍明确这是使用开发签名、仅供开发测试的 Android 包，不能据此视为商店正式版本。

### 整数版本与重跑恢复

仓库 `app.json` 的 `expo.android.versionCode` 为发布基数 **201**：

```text
versionCode = app.json 中的基数 + GITHUB_RUN_NUMBER
version = 基础版本-dev.versionCode
tag = dev-versionCode
```

例如基础版本 `1.0.6`，工作流第 42 次运行：

```text
应用版本：1.0.6-dev.243
Android versionCode：243
Release tag：dev-243
APK：nanobot-v1.0.6-dev.243.apk
```

- 下一次新运行（run number 43）版本码为 244，仅增加 1；失败或被取消的 run 仍占用编号，因此已发布版本允许跳号，不保证连续。
- `GITHUB_RUN_ATTEMPT` 不进入版本；第 42 次运行无论重跑多少次都仍是 `dev-243`，重跑只恢复同一版本，不生成新的版本。
- `scripts/prepare-ci-release.mjs` 从 checkout 的基础配置计算，只修改 runner 临时 `package.json`、`app.json`、`package-lock.json` 的版本；保留应用权限和其他配置，不提交、不推送，不触发循环。
- 基础版本要求三个配置一致且为 `X.Y.Z`；发布基数与 run number 必须是正整数，相加不得超过 Android `versionCode` 上限 **2100000000**，所有输入校验通过后才写文件。
- 不要删除并重建工作流或降低基数，以免运行编号重置或版本码倒退。版本 tag 不包含 SHA 或 attempt；源码仍通过 Release 的 target 指向完整 `GITHUB_SHA`，并记入 Release 备注。
- 开始操作 Release 前检查远端当前 main SHA 等于 `GITHUB_SHA`；不相等则跳过。资产上传后、公开前再次检查，避免构建或上传期间 main 更新后旧版本抢占 Latest。
- 同 tag Release 已公开时直接跳过，不覆盖资产、不重复设 Latest；查询失败（权限、网络等）会停止，不能当作 Release 不存在。
- 上一次失败留下的同 tag **草稿**可删除后重建；只删除草稿及其资产，不删除源码 tag。先上传 APK、`checksums.txt`、`update.json` 三个资产，全部成功后才以 `draft=false`、`latest=true` 公开；上传失败保持草稿。
- 旧 SHA 的重跑不会发布；即使源码仍在 main，已公开的同版本也不能通过重跑替换。需要修复时提交新变更，获得新的整数版本码。
- 不恢复旧的 SHA／attempt tag 或版本格式，也不兼容旧的嵌套更新清单。设备若曾安装版本码更高的旧实验包，新整数版本码不会绕过 Android 的降级限制；须自行确认设备当前版本码。

### 开发版更新资产与验证

每次 CI Release 和 Actions Artifact 包含 APK、`checksums.txt`、`update.json`。客户端仅 GET：

```text
https://github.com/yaotutu/nanobot-client/releases/latest/download/update.json
```

客户端不遍历历史 Release、不解析 tag、不从资产列表推测版本或下载地址；只按清单中的数值 `versionCode` 判断更新。新的清单包含以下八个平铺字段（`sha256` 供已发布的旧版客户端使用，当前客户端不校验）：

```json
{
  "version": "1.0.6-dev.243",
  "versionCode": 243,
  "apkUrl": "https://github.com/yaotutu/nanobot-client/releases/download/dev-243/nanobot-v1.0.6-dev.243.apk",
  "size": 123456789,
  "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "publishedAt": "2026-10-08T00:00:00.000Z",
  "notes": "main 分支自动构建的 Android 开发版 1.0.6-dev.243，仅用于开发测试；使用现有开发签名，不是应用商店正式签名。"
}
```

大小、hash 和时间仅为格式示例。`apkUrl` 由 `GITHUB_REPOSITORY`、`RELEASE_TAG`、`APK_NAME` 构造，固定指向这一次整数 tag 的 APK，而不是随 Latest 变化的 APK 地址。`publishedAt` 为验证通过后的清单生成时间（公开之前），使用 ISO UTC 字符串；notes 由脚本生成并说明开发用途。

- `scripts/prepare-update-manifest.mjs` 使用 Build-Tools 36.0.0 的 `aapt dump badging` 从实际 APK 读取包名、versionName、versionCode，验证固定包名 `com.anonymous.nanobotclient` 与本次 CI 版本一致，不从配置推测实际 APK 的元数据。
- 使用 `apksigner verify --print-certs` 验证签名，只接受唯一签名者的证书 SHA-256。当前证书固定为 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`，脚本内固定现有身份，**不会生成或更换密钥**，不可通过环境变量绕过。
- 签名变化、多签名者、包元数据缺失、工具验证失败或版本不一致都停止生成清单；只有全部成功才写出 `update.json`。包名与签名用于构建时验证，不作为旧协议字段输出。
- APK SHA-256 从实际文件流式计算，不把整个安装包载入内存；size 由同一文件的 `stat` 读取，不复用声明值或 `checksums.txt`。
- CLI 无位置参数，必需环境变量仅为 `ARTIFACT_DIR`、`APK_NAME`、`APP_VERSION`、`VERSION_CODE`、`RELEASE_TAG`、`GITHUB_REPOSITORY`、`AAPT_PATH`、`APKSIGNER_PATH`；输出到 `$ARTIFACT_DIR/update.json`。工具路径指向 `$ANDROID_HOME/build-tools/36.0.0/`。
- 清单不再包含 schema、channel、commit、minSdk、签名字段或嵌套 `apk` 对象；旧格式、无清单 Release 和老 tag 不作兼容回退。
- **应用内更新仅适用于 CI 发布**。下述本地 `npm run release` 保持原有行为，仅生成和上传 APK 与 `checksums.txt`，不生成 `update.json`，不是整数版本自动更新入口。本地脚本创建 Release 时显式传入 `--latest=false`，防止无清单手动包抢占 CI 的更新入口。手动包不参与应用内更新，不另建旧协议或备用更新通道。

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
