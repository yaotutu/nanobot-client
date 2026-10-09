import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseUpdateInfo } from '@/features/updates/model';

const script = resolve('scripts/prepare-update-manifest.mjs');
const signingSha = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
const version = '1.0.6-dev.243';
const apkName = `nanobot-v${version}.apk`;
const badging = `package: name='com.anonymous.nanobotclient' versionCode='243' versionName='${version}' platformBuildVersionCode='36'\nsdkVersion:'24'\ntargetSdkVersion:'36'\n`;
const certificate = `Signer #1 certificate DN: CN=Android Debug\nSigner #1 certificate SHA-256 digest: ${signingSha}\nSigner #1 certificate SHA-1 digest: ${'a'.repeat(40)}\n`;
const temporaryDirectories: string[] = [];

// 使用独立的假可执行文件驱动真实 CLI，测试不依赖 Android SDK、Java、真实 keystore 或原生目录。
// APK 字节只用于验证 stat/流式 hash；Android 元数据与签名验证结果由两个工具 fixture 提供。
const createFixture = () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'nanobot-update-'));
  temporaryDirectories.push(directory);
  const apkPath = resolve(directory, apkName);
  const manifestPath = resolve(directory, 'update.json');
  const tracePath = resolve(directory, 'tool-calls.jsonl');
  const bytes = Buffer.alloc(256 * 1024 + 17, 42);
  writeFileSync(apkPath, bytes);
  const tool = (name: string, output: string, exitCode = 0) => {
    const file = resolve(directory, name);
    writeFileSync(file, [
      `#!${process.execPath}`,
      "const { appendFileSync } = require('node:fs');",
      `appendFileSync(${JSON.stringify(tracePath)}, JSON.stringify({ name: ${JSON.stringify(name)}, args: process.argv.slice(2) }) + '\\n');`,
      `process.stdout.write(${JSON.stringify(output)});`,
      `process.exit(${exitCode});`,
      '',
    ].join('\n'), { mode: 0o755 });
    return file;
  };
  const env = {
    ...process.env,
    ARTIFACT_DIR: directory,
    APK_NAME: apkName,
    APP_VERSION: version,
    VERSION_CODE: '243',
    RELEASE_TAG: 'dev-243',
    GITHUB_REPOSITORY: 'yaotutu/nanobot-client',
    AAPT_PATH: tool('aapt', badging),
    APKSIGNER_PATH: tool('apksigner', certificate),
  };
  const execute = (overrides: Partial<NodeJS.ProcessEnv> = {}) => execFileSync(process.execPath, [script], {
    cwd: directory,
    env: { ...env, ...overrides },
    stdio: 'pipe',
  });
  // 任一校验失败，都必须返回非零且不写出一个可被后续步骤发布的清单。
  const reject = (overrides: Partial<NodeJS.ProcessEnv> = {}) => {
    expect(() => execute(overrides)).toThrow();
    expect(existsSync(manifestPath)).toBe(false);
  };
  return { directory, apkPath, manifestPath, tracePath, bytes, tool, execute, reject };
};

afterEach(() => temporaryDirectories.splice(0).forEach((directory) => {
  rmSync(directory, { recursive: true, force: true });
}));

describe('Android 开发版更新清单', () => {
  it('生成八个平铺字段，实际 APK 提供版本、大小和 hash，URL 指向同一 Release', () => {
    const fixture = createFixture();
    const startedAt = Date.now();
    fixture.execute();
    const finishedAt = Date.now();
    const manifestText = readFileSync(fixture.manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText);
    // 用客户端真实解析器验收脚本产物；sha256 只服务已发布旧客户端，当前类型会忽略该字段。
    const clientFields = { ...manifest } as Partial<typeof manifest>;
    delete clientFields.sha256;
    expect(parseUpdateInfo(manifest)).toEqual(clientFields);
    expect(manifest).toEqual({
      version,
      versionCode: 243,
      apkUrl: `https://github.com/yaotutu/nanobot-client/releases/download/dev-243/${apkName}`,
      size: fixture.bytes.length,
      sha256: createHash('sha256').update(fixture.bytes).digest('hex'),
      publishedAt: expect.any(String),
      notes: expect.stringContaining('仅用于开发测试'),
    });
    // 时间由工具本次生成且为 ISO 格式，不依赖测试机预先约定的时区或固定发布日期。
    const timestamp = Date.parse(manifest.publishedAt);
    expect(new Date(timestamp).toISOString()).toBe(manifest.publishedAt);
    expect(timestamp).toBeGreaterThanOrEqual(startedAt);
    expect(timestamp).toBeLessThanOrEqual(finishedAt);
    expect(manifest.notes).toContain(version);
    expect(manifestText.endsWith('\n')).toBe(true);
    expect(readFileSync(fixture.tracePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))).toEqual([
      { name: 'aapt', args: ['dump', 'badging', fixture.apkPath] },
      { name: 'apksigner', args: ['verify', '--print-certs', fixture.apkPath] },
    ]);
  });

  it('下载 URL 使用 GITHUB_REPOSITORY，不硬编码仓库，也不指向 Latest 的可变 APK', () => {
    const fixture = createFixture();
    fixture.execute({ GITHUB_REPOSITORY: 'example/fork-client' });
    expect(JSON.parse(readFileSync(fixture.manifestPath, 'utf8')).apkUrl)
      .toBe(`https://github.com/example/fork-client/releases/download/dev-243/${apkName}`);
  });

  it('旧身份环境变量不能绕过脚本中的固定包名和签名', () => {
    const fixture = createFixture();
    fixture.tool('apksigner', certificate.replace(signingSha, 'b'.repeat(64)));
    fixture.reject({ EXPECTED_SIGNING_CERTIFICATE_SHA256: 'b'.repeat(64) });
  });

  it('兼容工具 CRLF 和证书摘要大写，但清单摘要统一小写', () => {
    const fixture = createFixture();
    fixture.tool('aapt', badging.replace(/\n/g, '\r\n'));
    fixture.tool('apksigner', certificate.replace(signingSha, signingSha.toUpperCase()).replace(/\n/g, '\r\n'));
    fixture.execute();
    expect(JSON.parse(readFileSync(fixture.manifestPath, 'utf8')).sha256)
      .toBe(createHash('sha256').update(fixture.bytes).digest('hex'));
  });

  it.each([
    'ARTIFACT_DIR', 'APK_NAME', 'APP_VERSION', 'VERSION_CODE', 'RELEASE_TAG', 'GITHUB_REPOSITORY',
    'AAPT_PATH', 'APKSIGNER_PATH',
  ])('缺失 %s 时拒绝生成', (name) => createFixture().reject({ [name]: '' }));

  it.each([
    { RELEASE_TAG: 'dev-42.1-aaaaaaa' },
    { RELEASE_TAG: 'dev-244' },
    { RELEASE_TAG: '../dev-243' },
    { GITHUB_REPOSITORY: 'nanobot-client' },
    { GITHUB_REPOSITORY: 'owner/repo/extra' },
    { GITHUB_REPOSITORY: 'owner/repo?query' },
    { APP_VERSION: ' invalid ' },
    { APP_VERSION: '1.0.6\nextra' },
    { APP_VERSION: '1.0.6-dev.42.1' },
    { APP_VERSION: '1.0.6-dev.244' },
    { VERSION_CODE: '0' },
    { VERSION_CODE: '1.5' },
    { VERSION_CODE: '1e3' },
    { VERSION_CODE: '2100000001' },
    { VERSION_CODE: '9007199254740993' },
    { APK_NAME: '../outside.apk' },
    { APK_NAME: 'subdir/file.apk' },
    { APK_NAME: '/absolute.apk' },
    { APK_NAME: 'update.json' },
  ])('无效输入或试图改写固定身份时失败：%j', (overrides) => createFixture().reject(overrides));

  it.each([
    ['packageName', badging.replace('com.anonymous.nanobotclient', 'com.example.other')],
    ['versionName', badging.replace(version, '1.0.5')],
    ['versionCode', badging.replace("versionCode='243'", "versionCode='244'")],
    ['缺少 package', "sdkVersion:'24'\n"],
    ['重复 package', badging + badging],
    ['无效 versionCode', badging.replace("versionCode='243'", "versionCode='NaN'")],
  ])('APK 元数据不一致或无效（%s）时失败', (_label, output) => {
    const fixture = createFixture();
    fixture.tool('aapt', output);
    fixture.reject();
  });

  it.each([
    ['签名变化', certificate.replace(signingSha, 'b'.repeat(64))],
    ['摘要缺失', 'Signer #1 certificate DN: CN=Android Debug\n'],
    ['摘要损坏', certificate.replace(signingSha, 'not-a-digest')],
    ['摘要截断', certificate.replace(signingSha, signingSha.slice(1))],
    ['多签名者', certificate + certificate.replace(/#1/g, '#2')],
    ['重复证书', certificate + certificate],
  ])('签名不符合固定约束（%s）时失败', (_label, output) => {
    const fixture = createFixture();
    fixture.tool('apksigner', output);
    fixture.reject();
  });

  it.each(['aapt', 'apksigner'])('工具 %s 验证失败时即使 stdout 看似正常也不能发布', (name) => {
    const fixture = createFixture();
    fixture.tool(name, name === 'aapt' ? badging : certificate, 1);
    fixture.reject();
  });

  it.each(['AAPT_PATH', 'APKSIGNER_PATH'])('工具 %s 不存在时失败', (name) => {
    const fixture = createFixture();
    fixture.reject({ [name]: resolve(fixture.directory, 'missing-tool') });
  });

  it.each(['缺失', '空文件', '目录'])('APK 为%s时失败', (kind) => {
    const fixture = createFixture();
    if (kind === '缺失') rmSync(fixture.apkPath);
    if (kind === '空文件') writeFileSync(fixture.apkPath, '');
    if (kind === '目录') {
      rmSync(fixture.apkPath);
      mkdirSync(fixture.apkPath);
    }
    fixture.reject();
  });
});

// 工作流必须将定位同一 Release 的参数显式传给工具；身份约束不再交给可变环境参数。
describe('开发版清单的 CI 接入', () => {
  it('Build 后验证清单再保存资产，传入精简契约与固定工具路径', () => {
    const workflow = readFileSync(resolve('.github/workflows/android-development-release.yml'), 'utf8');
    const steps = [
      'Build split Android Release APKs', 'Prepare verified update manifest',
      'Save APKs and checksums', 'Publish development release',
    ].map((name) => workflow.indexOf('- name: ' + name));
    expect(steps.every((position) => position >= 0)).toBe(true);
    expect(steps.every((position, index) => index === 0 || position > steps[index - 1])).toBe(true);
    const manifestStep = workflow.slice(steps[1], steps[2]);
    [
      'ARTIFACT_DIR: ${{ steps.metadata.outputs.artifact_dir }}',
      'APK_NAME: ${{ steps.metadata.outputs.apk_name }}',
      'APP_VERSION: ${{ steps.metadata.outputs.version }}',
      'VERSION_CODE: ${{ steps.metadata.outputs.version_code }}',
      'RELEASE_TAG: ${{ steps.metadata.outputs.tag }}',
      'GITHUB_REPOSITORY: ${{ github.repository }}',
      'export AAPT_PATH="$ANDROID_HOME/build-tools/36.0.0/aapt"',
      'export APKSIGNER_PATH="$ANDROID_HOME/build-tools/36.0.0/apksigner"',
      'node scripts/prepare-update-manifest.mjs',
    ].forEach((expected) => expect(manifestStep).toContain(expected));
    ['EXPECTED_', 'GITHUB_SHA', 'MIN_SDK'].forEach((removed) => expect(manifestStep).not.toContain(removed));
    expect(workflow.slice(steps[2], steps[3])).toContain('path: ${{ steps.metadata.outputs.artifact_dir }}/');
  });
});
