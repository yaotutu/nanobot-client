import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// 只锁定当前开发包的身份，不创建、替换或读取 keystore；更换签名不能靠修改 CI 环境绕过。
const packageName = 'com.anonymous.nanobotclient';
const signingCertificateSha256 = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
const required = (name) => {
  const value = process.env[name];
  if (!value || value.trim() !== value || /[\r\n]/.test(value)) {
    throw new Error(`缺少或无效的环境变量：${name}`);
  }
  return value;
};
const positiveInteger = (value, label) => {
  const number = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(number)) {
    throw new Error(`${label} 必须为正整数。`);
  }
  return number;
};
const assertEqual = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label} 不一致：实际 ${actual}，期望 ${expected}`);
};

// 版本与资产定位由 CI 提供，包名和签名保持脚本内固定值；工具路径显式传入，避免误用 PATH。
const artifactDir = required('ARTIFACT_DIR');
const apkName = required('APK_NAME');
const version = required('APP_VERSION');
const versionCode = positiveInteger(required('VERSION_CODE'), 'VERSION_CODE');
const releaseTag = required('RELEASE_TAG');
const repository = required('GITHUB_REPOSITORY');
const aaptPath = required('AAPT_PATH');
const apksignerPath = required('APKSIGNER_PATH');
if (versionCode > 2100000000) throw new Error('versionCode 不得超过 Android 上限。');
// tag 仅定位本次 Release 资产，不从 tag 解析或回退版本；版本仍以实际 APK 的验证结果为准。
if (!/^\d+\.\d+\.\d+-dev\.\d+$/.test(version) || !version.endsWith(`-dev.${versionCode}`)) {
  throw new Error('APP_VERSION 必须为基础版本-dev.versionCode。');
}
assertEqual(releaseTag, `dev-${versionCode}`, 'RELEASE_TAG');
if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/.test(repository)) {
  throw new Error('GITHUB_REPOSITORY 必须为 owner/repository。');
}
// APK 只能是 artifact 目录中的单个文件，禁止路径穿越，也不允许将清单指向目录外的资产。
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.apk$/.test(apkName)) throw new Error('APK_NAME 必须是 APK 文件名。');
const apkPath = resolve(artifactDir, apkName);
const apkStat = await stat(apkPath);
if (!apkStat.isFile() || !Number.isSafeInteger(apkStat.size) || apkStat.size <= 0) {
  throw new Error('APK 必须是非空普通文件。');
}

// aapt 从已构建 APK 的 AndroidManifest 读取实际值；不从 app.json 或 Gradle 配置推测。
const badging = execFileSync(aaptPath, ['dump', 'badging', apkPath], { encoding: 'utf8' }).replace(/\r/g, '');
const packageLines = [...badging.matchAll(/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'(?: .*)?$/gm)];
if (packageLines.length !== 1) throw new Error('APK 包元数据缺失、格式无效或不唯一。');
const [, actualPackageName, actualVersionCodeText, actualVersion] = packageLines[0];
const actualVersionCode = positiveInteger(actualVersionCodeText, 'APK versionCode');
assertEqual(actualPackageName, packageName, 'APK packageName');
assertEqual(actualVersion, version, 'APK versionName');
assertEqual(actualVersionCode, versionCode, 'APK versionCode');

// verify 非零退出会直接终止，不能只打印证书而忽略签名校验。仅接受唯一签名者的证书 SHA-256，
// 不混用 SHA-1、证书 DN 或公钥摘要；多签名者也失败，防止清单遗漏额外的签名身份。
const certificates = execFileSync(apksignerPath, ['verify', '--print-certs', apkPath], { encoding: 'utf8' }).replace(/\r/g, '');
const signerLines = certificates.split('\n').filter((line) => /^Signer #\d+ certificate SHA-256 digest:/.test(line));
const signer = signerLines.length === 1 && signerLines[0].match(/^Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]{64})\s*$/);
if (!signer) throw new Error('APK 必须包含唯一且有效的签名证书 SHA-256。');
const actualSigningCertificateSha256 = signer[1].toLowerCase();
assertEqual(actualSigningCertificateSha256, signingCertificateSha256, 'APK signingCertificateSha256');

// 按流读取实际 APK，避免将大安装包一次性载入内存；大小来自同一个文件的 stat。
const hash = createHash('sha256');
for await (const chunk of createReadStream(apkPath)) hash.update(chunk);
// 客户端只获取 Latest 的这份平铺清单；APK URL 固定指向同一整数 tag 的资产，避免版本混用。
// publishedAt 是本次清单生成时间（公开前），notes 明确开发用途，不引入旧协议字段或可选配置。
const manifest = {
  version: actualVersion,
  versionCode: actualVersionCode,
  apkUrl: `https://github.com/${repository}/releases/download/${releaseTag}/${apkName}`,
  size: apkStat.size,
  sha256: hash.digest('hex'),
  publishedAt: new Date().toISOString(),
  notes: `main 分支自动构建的 Android 开发版 ${actualVersion}，仅用于开发测试；使用现有开发签名，不是应用商店正式签名。`,
};
// 所有身份、版本和文件验证成功后才写出 update.json，后续工作流只上传通过验证的产物。
await writeFile(resolve(artifactDir, 'update.json'), JSON.stringify(manifest, null, 2) + '\n');
