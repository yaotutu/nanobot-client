import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/prepare-ci-release.mjs');
const temporaryDirectories: string[] = [];

// 在临时仓库中运行真实脚本，既验证 GitHub Output 协议，也保证不修改项目版本。
const createFixture = () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'nanobot-ci-release-'));
  temporaryDirectories.push(directory);
  const files = {
    'package.json': { name: 'nanobot-client', version: '1.0.6', private: true },
    'app.json': { expo: { version: '1.0.6', android: { package: 'com.anonymous.nanobotclient' } } },
    'package-lock.json': {
      version: '1.0.6',
      lockfileVersion: 3,
      packages: { '': { name: 'nanobot-client', version: '1.0.6' }, dependency: { version: '2.0.0' } },
    },
  };
  Object.entries(files).forEach(([file, content]) => {
    writeFileSync(resolve(directory, file), JSON.stringify(content));
  });
  const output = resolve(directory, 'github-output');
  const execute = (overrides: Partial<NodeJS.ProcessEnv> = {}) => execFileSync(process.execPath, [script], {
    cwd: directory,
    env: {
      ...process.env,
      GITHUB_RUN_NUMBER: '42',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: 'a'.repeat(40),
      GITHUB_OUTPUT: output,
      ...overrides,
    },
    stdio: 'pipe',
  });
  const read = (file: string) => JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
  return { directory, files, output, execute, read };
};

afterEach(() => temporaryDirectories.splice(0).forEach((directory) => {
  rmSync(directory, { recursive: true, force: true });
}));

describe('Android CI 开发版元数据', () => {
  it('同步版本和版本码，保留其他配置并输出打包路径', () => {
    const fixture = createFixture();
    fixture.execute();
    expect(fixture.read('package.json')).toEqual({ ...fixture.files['package.json'], version: '1.0.6-dev.42.1' });
    expect(fixture.read('app.json').expo).toEqual({
      version: '1.0.6-dev.42.1',
      android: { package: 'com.anonymous.nanobotclient', versionCode: 4201 },
    });
    const lock = fixture.read('package-lock.json');
    expect(lock.version).toBe('1.0.6-dev.42.1');
    expect(lock.packages[''].version).toBe(lock.version);
    expect(lock.packages.dependency).toEqual({ version: '2.0.0' });
    expect(readFileSync(fixture.output, 'utf8')).toBe([
      'version=1.0.6-dev.42.1',
      'version_code=4201',
      'tag=dev-42.1-aaaaaaa',
      'artifact_dir=release-assets/v1.0.6-dev.42.1',
      'apk_name=nanobot-v1.0.6-dev.42.1.apk',
      '',
    ].join('\n'));
  });

  it.each([
    ['42', '2', 4202, '1.0.6-dev.42.2'],
    ['43', '1', 4301, '1.0.6-dev.43.1'],
  ])('新提交和重新运行都有独立版本：%s/%s', (run, attempt, code, version) => {
    const fixture = createFixture();
    fixture.execute({ GITHUB_RUN_NUMBER: run, GITHUB_RUN_ATTEMPT: attempt });
    expect(fixture.read('app.json').expo).toMatchObject({ version, android: { versionCode: code } });
  });

  it.each([
    { GITHUB_RUN_NUMBER: '' },
    { GITHUB_RUN_NUMBER: '1.5' },
    { GITHUB_RUN_NUMBER: '21000000' },
    { GITHUB_RUN_ATTEMPT: '0' },
    { GITHUB_RUN_ATTEMPT: '100' },
    { GITHUB_SHA: 'main' },
    { GITHUB_OUTPUT: '' },
  ])('无效输入不得修改版本：%j', (overrides) => {
    const fixture = createFixture();
    expect(() => fixture.execute(overrides)).toThrow();
    Object.entries(fixture.files).forEach(([file, content]) => {
      expect(fixture.read(file)).toEqual(content);
    });
  });

  it('基础版本不一致时拒绝打包，不写入部分版本', () => {
    const fixture = createFixture();
    writeFileSync(resolve(fixture.directory, 'app.json'), JSON.stringify({ expo: { version: '1.0.5' } }));
    expect(() => fixture.execute()).toThrow();
    expect(fixture.read('package.json')).toEqual(fixture.files['package.json']);
    expect(fixture.read('app.json').expo.version).toBe('1.0.5');
    expect(fixture.read('package-lock.json')).toEqual(fixture.files['package-lock.json']);
  });
});

// 防止干净 runner 再次在原生工程生成前执行 Gradle 缓存：本地 android/ 会掩盖此问题。
// 从真实工作流读取步骤位置，不复制一份测试用流程，也不要求提交原生目录。
describe('Android CI 工作流执行顺序', () => {
  it('安装依赖、完整检查和版本生成后先 prebuild，再初始化 Gradle 缓存并构建发布', () => {
    const workflow = readFileSync(resolve('.github/workflows/android-development-release.yml'), 'utf8');
    const steps = [
      'Install dependencies', 'Run all checks', 'Prepare development version',
      'Prepare Android project for Gradle cache', 'Cache Gradle dependencies',
      'Build Android Release APK', 'Save APK and checksums', 'Publish development prerelease',
    ].map((name) => workflow.indexOf('- name: ' + name));
    expect(steps.every((position) => position >= 0)).toBe(true);
    expect(steps.every((position, index) => index === 0 || position > steps[index - 1])).toBe(true);
    expect(workflow).toContain('run: npx expo prebuild --platform android --no-install');
    expect(workflow).toContain('cache-provider: basic');
  });
});
