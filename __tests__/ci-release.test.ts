import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/prepare-ci-release.mjs');
const workflow = readFileSync(resolve('.github/workflows/android-development-release.yml'), 'utf8');
const temporaryDirectories: string[] = [];
const temporaryDirectory = () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'nanobot-ci-release-'));
  temporaryDirectories.push(directory);
  return directory;
};

// 临时仓库始终从同一基数启动，模拟 GitHub 重跑时重新 checkout，而非重复修改已经生成的配置。
// 保留权限与无关依赖字段，保护共享工作区中的应用配置不被版本脚本覆盖。
const createFixture = (baseVersionCode: unknown = 201) => {
  const directory = temporaryDirectory();
  const files = {
    'package.json': { name: 'nanobot-client', version: '1.0.6', private: true },
    'app.json': { expo: { version: '1.0.6', android: {
      package: 'com.anonymous.nanobotclient', versionCode: baseVersionCode,
      permissions: ['android.permission.REQUEST_INSTALL_PACKAGES'],
      blockedPermissions: ['android.permission.RECORD_AUDIO'],
    } } },
    'package-lock.json': {
      version: '1.0.6', lockfileVersion: 3,
      packages: { '': { name: 'nanobot-client', version: '1.0.6' }, dependency: { version: '2.0.0' } },
    },
  };
  Object.entries(files).forEach(([file, content]) => {
    writeFileSync(resolve(directory, file), JSON.stringify(content));
  });
  const output = resolve(directory, 'github-output');
  const execute = (overrides: Partial<NodeJS.ProcessEnv> = {}) => execFileSync(process.execPath, [script], {
    cwd: directory,
    env: { ...process.env, GITHUB_RUN_NUMBER: '42', GITHUB_OUTPUT: output, ...overrides },
    stdio: 'pipe',
  });
  const read = (file: string) => JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
  const unchanged = () => Object.entries(files).forEach(([file, content]) => expect(read(file)).toEqual(content));
  return { directory, files, output, execute, read, unchanged };
};

afterEach(() => temporaryDirectories.splice(0).forEach((directory) => {
  rmSync(directory, { recursive: true, force: true });
}));

describe('Android CI 整数版本', () => {
  it('以 201 为基数同步三个配置，仅改版本并输出整数 tag 和构建路径', () => {
    const fixture = createFixture();
    fixture.execute();
    expect(fixture.read('package.json')).toEqual({ ...fixture.files['package.json'], version: '1.0.6-dev.243' });
    expect(fixture.read('app.json').expo).toEqual({
      version: '1.0.6-dev.243',
      android: { ...fixture.files['app.json'].expo.android, versionCode: 243 },
    });
    const lock = fixture.read('package-lock.json');
    expect(lock.version).toBe('1.0.6-dev.243');
    expect(lock.packages[''].version).toBe(lock.version);
    expect(lock.packages.dependency).toEqual({ version: '2.0.0' });
    expect(readFileSync(fixture.output, 'utf8')).toBe([
      'version=1.0.6-dev.243', 'version_code=243', 'tag=dev-243',
      'artifact_dir=release-assets/v1.0.6-dev.243', 'apk_name=nanobot-v1.0.6-dev.243-universal.apk', '',
    ].join('\n'));
  });

  it('连续的新 run 版本码只增加 1，失败留下的编号允许跳过', () => {
    const codes = ['42', '43', '45'].map((run) => {
      const fixture = createFixture();
      fixture.execute({ GITHUB_RUN_NUMBER: run });
      return fixture.read('app.json').expo.android.versionCode;
    });
    expect(codes).toEqual([243, 244, 246]);
  });

  it.each(['1', '2', '100', '', 'not-a-number'])('重跑 attempt=%s 不影响版本，也不要求 SHA', (attempt) => {
    const fixture = createFixture();
    fixture.execute({ GITHUB_RUN_ATTEMPT: attempt, GITHUB_SHA: '' });
    expect(fixture.read('app.json').expo).toMatchObject({ version: '1.0.6-dev.243', android: { versionCode: 243 } });
    expect(readFileSync(fixture.output, 'utf8')).toContain('tag=dev-243\n');
  });

  it('允许恰好达到 Android 版本码上限', () => {
    const fixture = createFixture();
    fixture.execute({ GITHUB_RUN_NUMBER: String(2100000000 - 201) });
    expect(fixture.read('app.json').expo.android.versionCode).toBe(2100000000);
  });

  it.each([
    { GITHUB_RUN_NUMBER: '' }, { GITHUB_RUN_NUMBER: '0' }, { GITHUB_RUN_NUMBER: '-1' },
    { GITHUB_RUN_NUMBER: '1.5' }, { GITHUB_RUN_NUMBER: '1e3' }, { GITHUB_RUN_NUMBER: ' 42' },
    { GITHUB_RUN_NUMBER: String(2100000001 - 201) }, { GITHUB_RUN_NUMBER: '9007199254740993' },
    { GITHUB_OUTPUT: '' },
  ])('无效输入或超出上限不修改配置：%j', (overrides) => {
    const fixture = createFixture();
    expect(() => fixture.execute(overrides)).toThrow();
    fixture.unchanged();
  });

  it.each([undefined, '201', 0, -1, 1.5, 2100000000, Number.MAX_SAFE_INTEGER])('无效或溢出基数 %s 不修改配置', (base) => {
    // 显式赋值 undefined，避免 createFixture 的默认参数将缺失字段补为 201。
    const fixture = createFixture(base);
    if (base === undefined) {
      delete (fixture.files['app.json'].expo.android as { versionCode?: unknown }).versionCode;
      writeFileSync(resolve(fixture.directory, 'app.json'), JSON.stringify(fixture.files['app.json']));
    }
    expect(() => fixture.execute()).toThrow();
    fixture.unchanged();
  });

  it('基础版本不一致时拒绝部分写入', () => {
    const fixture = createFixture();
    writeFileSync(resolve(fixture.directory, 'app.json'), JSON.stringify({ expo: { version: '1.0.5' } }));
    expect(() => fixture.execute()).toThrow();
    expect(fixture.read('package.json')).toEqual(fixture.files['package.json']);
    expect(fixture.read('app.json').expo.version).toBe('1.0.5');
    expect(fixture.read('package-lock.json')).toEqual(fixture.files['package-lock.json']);
  });
});

// 直接提取真实工作流的发布 shell，不复制逻辑。替身 gh 只写临时日志，绝不调用网络或真实发布 API。
const publishStep = workflow.slice(workflow.indexOf('- name: Publish development release'));
const publishShell = publishStep.slice(publishStep.indexOf('        run: |\n') + '        run: |\n'.length)
  .split('\n').map((line) => line.startsWith('          ') ? line.slice(10) : line).join('\n');
const executePublish = (overrides: Partial<NodeJS.ProcessEnv> = {}) => {
  const directory = temporaryDirectory();
  const trace = resolve(directory, 'gh-calls.jsonl');
  writeFileSync(resolve(directory, 'gh'), [
    `#!${process.execPath}`,
    "const { appendFileSync, existsSync, readFileSync } = require('node:fs');",
    'const args = process.argv.slice(2);',
    `const trace = ${JSON.stringify(trace)};`,
    "const previous = existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\\n').map(JSON.parse) : [];",
    "appendFileSync(trace, JSON.stringify(args) + '\\n');",
    "if (args[0] === 'api') {",
    "  if (process.env.MAIN_API_FAIL === '1') process.exit(1);",
    "  const calls = previous.filter((call) => call[0] === 'api').length;",
    "  process.stdout.write(calls === 0 ? process.env.MAIN_SHA : process.env.FINAL_MAIN_SHA);",
    "} else if (args[1] === 'view' && args.includes('isDraft')) {",
    "  if (process.env.RELEASE_STATE === 'missing') { process.stderr.write('release not found'); process.exit(1); }",
    "  if (process.env.RELEASE_STATE === 'error') { process.stderr.write('HTTP 403: forbidden'); process.exit(1); }",
    '  process.stdout.write(process.env.RELEASE_STATE);',
    "} else if (args[1] === 'upload' && process.env.UPLOAD_FAIL === '1') { process.exit(1);",
    "} else if (args[1] === 'view') { process.stdout.write('https://github.com/example/project/releases/tag/dev-243'); }",
    '',
  ].join('\n'), { mode: 0o755 });
  // 发布 shell 只检查文件是否存在，不读取 APK 内容；用五个空文件模拟 Gradle split 的完整产物。
  const artifactDir = resolve(directory, 'release-assets/v1.0.6-dev.243');
  mkdirSync(artifactDir, { recursive: true });
  ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64', 'universal'].forEach((abi) => {
    writeFileSync(resolve(artifactDir, `nanobot-v1.0.6-dev.243-${abi}.apk`), '');
  });

  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', publishShell], {
    cwd: directory,
    env: {
      ...process.env, PATH: `${directory}:${process.env.PATH}`, GH_TOKEN: 'fake', GH_REPO: 'example/project',
      RELEASE_TAG: 'dev-243', APP_VERSION: '1.0.6-dev.243', VERSION_CODE: '243',
      ARTIFACT_DIR: 'release-assets/v1.0.6-dev.243', APK_NAME: 'nanobot-v1.0.6-dev.243-universal.apk',
      GITHUB_SHA: 'a'.repeat(40), MAIN_SHA: 'a'.repeat(40), FINAL_MAIN_SHA: 'a'.repeat(40),
      GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'example/project', GITHUB_RUN_ID: '123',
      GITHUB_STEP_SUMMARY: resolve(directory, 'summary'), RELEASE_STATE: 'missing',
      MAIN_API_FAIL: '0', UPLOAD_FAIL: '0', ...overrides,
    }, encoding: 'utf8',
  });
  const calls: string[][] = readFileSync(trace, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return { result, calls, releaseCommands: calls.filter((call) => call[0] === 'release').map((call) => call[1]) };
};

describe('Android CI 工作流与幂等发布', () => {
  it('检查后先 prebuild 再初始化缓存，构建验证与保存资产后才发布', () => {
    const positions = [
      'Install dependencies', 'Run all checks', 'Prepare development version',
      'Prepare Android project for Gradle cache', 'Cache Gradle dependencies', 'Build split Android Release APKs',
      'Prepare verified update manifest', 'Save APKs and checksums', 'Publish development release',
    ].map((name) => workflow.indexOf('- name: ' + name));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions.every((position, index) => index === 0 || position > positions[index - 1])).toBe(true);
    expect(workflow).toContain('run: npx expo prebuild --platform android --no-install');
    expect(workflow).toContain('cache-provider: basic');
  });

  it('main job 使用固定并发组取消旧运行，不允许非 main job 发布', () => {
    expect(workflow).toMatch(/if: github.ref == 'refs\/heads\/main'[\s\S]*? {4}concurrency:\n {6}group: android-development-release-main\n {6}cancel-in-progress: true/);
    expect(workflow).not.toContain('GITHUB_RUN_ATTEMPT');
  });

  it('先建普通草稿并上传全部 APK 与清单，复查 main 后才公开并设为 Latest', () => {
    const { result, calls, releaseCommands } = executePublish();
    expect(result.status, result.stderr).toBe(0);
    expect(releaseCommands).toEqual(['view', 'create', 'upload', 'edit', 'view']);
    expect(calls[0]).toEqual(['api', 'repos/example/project/git/ref/heads/main', '--jq', '.object.sha']);
    expect(calls.find((call) => call[1] === 'create')).toEqual([
      'release', 'create', 'dev-243', '--target', 'a'.repeat(40), '--title', 'nanobot 1.0.6-dev.243',
      '--notes-file', 'release-notes.md', '--prerelease=false', '--draft', '--latest=false',
    ]);
    expect(calls.find((call) => call[1] === 'upload')).toEqual([
      'release', 'upload', 'dev-243',
      'release-assets/v1.0.6-dev.243/nanobot-v1.0.6-dev.243-arm64-v8a.apk',
      'release-assets/v1.0.6-dev.243/nanobot-v1.0.6-dev.243-armeabi-v7a.apk',
      'release-assets/v1.0.6-dev.243/nanobot-v1.0.6-dev.243-universal.apk',
      'release-assets/v1.0.6-dev.243/nanobot-v1.0.6-dev.243-x86.apk',
      'release-assets/v1.0.6-dev.243/nanobot-v1.0.6-dev.243-x86_64.apk',
      'release-assets/v1.0.6-dev.243/checksums.txt', 'release-assets/v1.0.6-dev.243/update.json',
    ]);
    expect(calls.slice(-3)[0][0]).toBe('api');
    expect(calls.find((call) => call[1] === 'edit')).toEqual(['release', 'edit', 'dev-243', '--draft=false', '--latest=true']);
    expect(publishShell).toContain('仅用于开发测试');
  });

  it('同 tag 已公开则重跑只查询，不覆盖、不删除、不发布', () => {
    const { result, releaseCommands } = executePublish({ RELEASE_STATE: 'false' });
    expect(result.status).toBe(0);
    expect(releaseCommands).toEqual(['view']);
  });

  it('半成品草稿删除后重建，不删除源码 tag', () => {
    const { result, calls, releaseCommands } = executePublish({ RELEASE_STATE: 'true' });
    expect(result.status, result.stderr).toBe(0);
    expect(releaseCommands).toEqual(['view', 'delete', 'create', 'upload', 'edit', 'view']);
    expect(calls.find((call) => call[1] === 'delete')).toEqual(['release', 'delete', 'dev-243', '--yes']);
  });

  it('旧 SHA 运行直接跳过，不触碰任何 Release', () => {
    const { result, releaseCommands } = executePublish({ MAIN_SHA: 'b'.repeat(40) });
    expect(result.status).toBe(0);
    expect(releaseCommands).toEqual([]);
  });

  it('上传期间 main 更新则保留草稿，不公开旧构建', () => {
    const { result, releaseCommands } = executePublish({ FINAL_MAIN_SHA: 'b'.repeat(40) });
    expect(result.status).toBe(0);
    expect(releaseCommands).toEqual(['view', 'create', 'upload']);
  });

  it.each([
    { RELEASE_STATE: 'error' }, { RELEASE_STATE: 'unexpected' }, { MAIN_API_FAIL: '1' }, { UPLOAD_FAIL: '1' },
  ])('查询或上传失败必须停止，不误判缺失、不设 Latest：%j', (overrides) => {
    const { result, releaseCommands } = executePublish(overrides);
    expect(result.status).not.toBe(0);
    expect(releaseCommands).not.toContain('edit');
    expect(releaseCommands).not.toContain('delete');
    if (!overrides.UPLOAD_FAIL) expect(releaseCommands).not.toContain('create');
  });
});

// 本地发布没有更新清单，必须明确排除 Latest，不能破坏 CI 的固定更新入口。
it('手动发布脚本不会将无清单 APK 设为 Latest', () => {
  const localRelease = readFileSync(resolve('scripts/release.sh'), 'utf8');
  expect(localRelease).toMatch(/gh release create[\s\S]*?--latest=false/);
});
