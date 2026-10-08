import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

// 此脚本仅在 CI 临时工作区使用：生成可追溯的开发版本，不提交版本变更。
// 在写入任何配置前校验全部输入，避免本地误执行或 CI 参数缺失时污染版本文件。
const { GITHUB_RUN_NUMBER, GITHUB_OUTPUT } = process.env;
const runNumber = Number(GITHUB_RUN_NUMBER);
// run_attempt 与提交 SHA 不参与版本计算；重跑同一次运行只恢复同一版本。
if (!/^[1-9]\d*$/.test(GITHUB_RUN_NUMBER ?? '')
  || !Number.isSafeInteger(runNumber) || !GITHUB_OUTPUT) {
  throw new Error('需要有效的 GitHub 构建编号（正整数）和输出文件。');
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

// 仓库 android.versionCode 是发布基数；新 run 加一，失败或被取消的 run 可以留下空号。
// 保持工作流及基数稳定，避免 run_number 重置或基数降低导致版本倒退；重跑不另占版本。
const baseVersionCode = appJson.expo.android?.versionCode;
if (!Number.isSafeInteger(baseVersionCode) || baseVersionCode < 1) {
  throw new Error('app.json 的 android.versionCode 发布基数必须为正整数。');
}
const versionCode = baseVersionCode + runNumber;
if (!Number.isSafeInteger(versionCode) || versionCode > 2100000000) {
  throw new Error('Android versionCode 超出上限。');
}
const version = `${baseVersion}-dev.${versionCode}`;
const tag = `dev-${versionCode}`;
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
