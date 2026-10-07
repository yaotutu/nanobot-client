import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

// 此脚本仅在 CI 临时工作区使用：生成可追溯的开发版本，不提交版本变更。
// 在写入任何配置前校验全部输入，避免本地误执行或 CI 参数缺失时污染版本文件。
const { GITHUB_RUN_NUMBER, GITHUB_RUN_ATTEMPT, GITHUB_SHA, GITHUB_OUTPUT } = process.env;
const runNumber = Number(GITHUB_RUN_NUMBER);
const runAttempt = Number(GITHUB_RUN_ATTEMPT);
if (!Number.isSafeInteger(runNumber) || runNumber < 1
  || !Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt >= 100
  || !/^[a-f0-9]{40}$/.test(GITHUB_SHA ?? '') || !GITHUB_OUTPUT) {
  throw new Error('需要有效的 GitHub 构建编号、重试编号（1–99）、完整提交 SHA 和输出文件。');
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const packageJson = readJson('package.json');
const appJson = readJson('app.json');
const packageLock = readJson('package-lock.json');
const baseVersion = packageJson.version;
if (!/^\d+\.\d+\.\d+$/.test(baseVersion)
  || appJson.expo.version !== baseVersion
  || packageLock.version !== baseVersion
  || packageLock.packages[''].version !== baseVersion) {
  throw new Error('package.json、app.json、package-lock.json 的基础版本必须一致且为 X.Y.Z。');
}

// 每个工作流运行占用 100 个版本码，重试也能递增；Android 上限为 2100000000。
// 工作流不要删除后重建，否则 GitHub 的 run_number 会重置，影响 APK 覆盖安装。
const versionCode = runNumber * 100 + runAttempt;
if (versionCode > 2100000000) throw new Error('Android versionCode 超出上限。');
const version = `${baseVersion}-dev.${runNumber}.${runAttempt}`;

const tag = `dev-${runNumber}.${runAttempt}-${GITHUB_SHA.slice(0, 7)}`;
const updatedFiles = {
  'package.json': { ...packageJson, version },
  'app.json': {
    ...appJson,
    expo: {
      ...appJson.expo,
      version,
      android: { ...appJson.expo.android, versionCode },
    },
  },
  'package-lock.json': {
    ...packageLock,
    version,
    packages: { ...packageLock.packages, '': { ...packageLock.packages[''], version } },
  },
};
Object.entries(updatedFiles).forEach(([file, content]) => {
  writeFileSync(file, JSON.stringify(content, null, 2) + '\n');
});

// 输出与现有 release.sh 的目录/文件命名保持一致，工作流无需再次复制或重命名 APK。
appendFileSync(GITHUB_OUTPUT, [
  `version=${version}`,
  `version_code=${versionCode}`,
  `tag=${tag}`,
  `artifact_dir=release-assets/v${version}`,
  `apk_name=nanobot-v${version}.apk`,
  '',
].join('\n'));
