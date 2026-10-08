import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { PreferencesModal } from '@/features/settings/components/PreferencesModal';
import type { UpdateState } from '@/features/updates/store';
import { supportedLocales } from '@/i18n/config';
import { apiClient } from '@/services/api/api';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import { DARK_COLORS, LIGHT_COLORS } from '@/ui/colors';

// 服务器偏好是纯展示数据；测试里使用独立地址，避免依赖真实局域网网关。

// 仅隔离 Jest 无法直接加载的装饰性 ESM 图标，仍测试真实列表与 Modal 交互。
jest.mock('lucide-react-native/icons/arrow-left', () => () => null);
jest.mock('lucide-react-native/icons/check', () => () => null);
jest.mock('lucide-react-native/icons/chevron-right', () => () => null);
jest.mock('lucide-react-native/icons/server', () => () => null);
jest.mock('lucide-react-native/icons/download', () => () => null);
jest.mock('lucide-react-native/icons/languages', () => () => null);
jest.mock('lucide-react-native/icons/log-out', () => () => null);
jest.mock('lucide-react-native/icons/moon', () => () => null);
jest.mock('lucide-react-native/icons/sun', () => () => null);
jest.mock('lucide-react-native/icons/x', () => () => null);

// 返回翻译 key 以验证文案契约；显式提供 language，使更新详情的发布日期格式化不依赖真实 i18n 初始化。
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

// 弹窗只需要安全区尺寸；固定边距即可，无需引入真实原生 provider。
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

// 在 API 单例边界和 fetch 边界分别监视调用：既捕获误用服务端 API，
// 也防止组件绕过单例直接发请求。测试不 mock 生产弹窗及主题/语言选项。
jest.mock('@/services/api/api', () => ({
  apiClient: {
    request: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// 仅提供当前支持的主题与语言；冻结对象，确保单项更新保留另一项且不直接修改入参。
const serverUrl = 'http://example.test:8765';
const preferences = Object.freeze<LocalPreferences>({
  theme: 'light',
  language: 'en',
  serverUrl,
  serverConfigured: true,
});

// 只导入状态类型，不加载原生 runtime 或真实 store；每次构造独立 controller，
// 由 rerender 显式传入新状态，验证展示与用户动作，不在测试中模拟联网或安装器。
const createUpdates = (overrides: Partial<UpdateState> = {}) => ({
  runtime: { version: '1.0.6', versionCode: 106, supported: true, development: false },
  candidate: null,
  lastCheckedAt: null,
  checkStatus: 'idle',
  checkError: null,
  actionError: null,
  stage: 'idle',
  downloadedBytes: 0,
  verifiedUri: null,
  check: jest.fn<UpdateState['check']>(async () => undefined),
  download: jest.fn<UpdateState['download']>(async () => undefined),
  install: jest.fn<UpdateState['install']>(async () => undefined),
  permission: jest.fn<UpdateState['permission']>(async () => undefined),
  cancel: jest.fn<UpdateState['cancel']>(),
  ...overrides,
} satisfies UpdateState);

// 候选更新同样是纯数据；固定版本码、日期和 2 MB 大小，使版本摘要与 50% 进度可重复断言。
const createCandidate = (): NonNullable<UpdateState['candidate']> => ({
  version: '1.0.7-dev.202', versionCode: 202,
  apkUrl: 'https://github.com/yaotutu/nanobot-client/releases/download/dev-202/nanobot-v1.0.7-dev.202.apk',
  size: 2 * 1048576, sha256: 'b'.repeat(64), publishedAt: '2026-10-08T08:00:00Z', notes: 'Native 测试用更新说明',
});

// 所有自动动作都属于外部 controller；展示、导航和关闭不应检查、下载、安装或取消。
const expectNoUpdateActions = (updates: UpdateState) => {
  [updates.check, updates.download, updates.install, updates.permission, updates.cancel]
    .forEach((callback) => expect(callback).not.toHaveBeenCalled());
};

const createProps = () => ({
  colors: LIGHT_COLORS,
  preferences,
  updates: createUpdates(),
  visible: true,
  onChange: jest.fn<(next: LocalPreferences) => void>(),
  onServerChange: jest.fn(async () => undefined),
  onClose: jest.fn<() => void>(),
  onLogout: jest.fn(async () => undefined),
});

// 当前进度条是带 role/value 的普通 View，而非可聚焦的 accessible 节点；
// 直接检查真实宿主属性与数值，不改生产组件，也不把 getByRole 查询失败误判为进度未渲染。
const progressNode = (result: Awaited<ReturnType<typeof render>>) => {
  const nodes = result.container.queryAll((node) => node.props.accessibilityRole === 'progressbar');
  expect(nodes).toHaveLength(1);
  return nodes[0];
};

const mockFetch = jest.fn<typeof fetch>(async () => {
  throw new Error('本地偏好弹窗不应发起服务端请求');
});

describe('PreferencesModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('隐藏时不渲染内容，也不触发业务回调', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} visible={false} />);
    expect(result.toJSON()).toBeNull();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onLogout).not.toHaveBeenCalled();
    expect(props.onServerChange).not.toHaveBeenCalled();
    expectNoUpdateActions(props.updates);
  });

  it('首页展示主题、语言和应用更新摘要，退出单独分组，不平铺全部选项', async () => {
    const result = await render(<PreferencesModal {...createProps()} />);
    expect(result.getAllByText(/.+/).map((node) => node.props.children)).toEqual([
      'sidebar.settings', 'settings.preferences.note', 'settings.preferences.group',
      'settings.rows.theme', 'settings.values.light', 'sidebar.language.label', 'English',
      'settings.preferences.connectionGroup', 'settings.rows.server', serverUrl,
      'updates.appGroup', 'updates.title', 'updates.unknown',
      'settings.preferences.account', 'app.account.logout',
    ]);
    expect(result.queryAllByRole('radio')).toHaveLength(0);
    expect(result.getAllByRole('button')).toHaveLength(6);
    expect(result.getByRole('button', { name: 'settings.rows.server' })).toHaveAccessibilityValue({ text: serverUrl });
    expect(result.getByRole('button', { name: 'updates.title' })).toHaveAccessibilityValue({ text: 'updates.unknown' });
    expect(result.queryByTestId('settings-update-badge')).toBeNull();
    expect(result.getByRole('button', { name: 'settings.rows.theme' })).toHaveAccessibilityValue({ text: 'settings.values.light' });
    expect(result.getByRole('button', { name: 'sidebar.language.label' })).toHaveAccessibilityValue({ text: 'English' });
  });

  it('服务器地址只提交规范化结果，非法输入阻止保存', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'settings.rows.server' }));
    expect(result.getByRole('header', { name: 'settings.rows.server' })).toBeTruthy();
    expect(result.getByDisplayValue(serverUrl)).toBeTruthy();

    await fireEvent.changeText(result.getByDisplayValue(serverUrl), 'not-a-url');
    expect(result.getByText('settings.server.invalid')).toBeTruthy();
    expect(result.getByRole('button', { name: 'settings.server.save' })).toBeDisabled();

    await fireEvent.changeText(result.getByDisplayValue('not-a-url'), 'http://example.test:9999/');
    await fireEvent.press(result.getByRole('button', { name: 'settings.server.save' }));
    expect(props.onServerChange).toHaveBeenCalledWith('http://example.test:9999');
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onLogout).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('展示及本地操作均不调用服务端', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'settings.rows.theme' }));
    await fireEvent.press(result.getByRole('radio', { name: 'settings.values.dark' }));
    await fireEvent.press(result.getByRole('button', { name: 'settings.preferences.back' }));
    await fireEvent.press(result.getByRole('button', { name: 'sidebar.language.label' }));
    await fireEvent.press(result.getByRole('radio', { name: '简体中文' }));
    await fireEvent.press(result.getByRole('button', { name: 'settings.preferences.back' }));
    await fireEvent.press(result.getByRole('button', { name: 'app.account.logout' }));
    expect(props.onLogout).toHaveBeenCalledTimes(1);
    expect(apiClient.request).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(['light', 'dark'] as const)('主题详情只显示两个选项，选择 %s 时仅变更 theme', async (theme) => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'settings.rows.theme' }));
    expect(result.getAllByRole('radio')).toHaveLength(2);
    expect(result.queryByText('English')).toBeNull();
    await fireEvent.press(result.getByRole('radio', { name: 'settings.values.' + theme }));
    expect(props.onChange).toHaveBeenCalledWith({ ...preferences, theme });
    const next = { ...preferences, theme };
    await result.rerender(<PreferencesModal {...props} preferences={next} />);
    expect(result.getByRole('radio', { name: 'settings.values.' + theme, checked: true })).toBeTruthy();
    await fireEvent.press(result.getByRole('button', { name: 'settings.preferences.back' }));
    expect(result.getByRole('button', { name: 'settings.rows.theme' })).toHaveAccessibilityValue({ text: 'settings.values.' + theme });
  });

  it.each(supportedLocales)('语言详情选择 $code 时只变更 language，并立即更新勾选与首页摘要', async (locale) => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'sidebar.language.label' }));
    expect(result.getAllByRole('radio')).toHaveLength(supportedLocales.length);
    expect(result.queryByText('settings.values.light')).toBeNull();
    await fireEvent.press(result.getByRole('radio', { name: locale.nativeLabel }));
    expect(props.onChange).toHaveBeenCalledWith({ ...preferences, language: locale.code });
    await result.rerender(<PreferencesModal {...props} preferences={{ ...preferences, language: locale.code }} />);
    expect(result.getByRole('radio', { name: locale.nativeLabel, checked: true })).toBeTruthy();
    await fireEvent.press(result.getByRole('button', { name: 'settings.preferences.back' }));
    expect(result.getByRole('button', { name: 'sidebar.language.label' })).toHaveAccessibilityValue({ text: locale.nativeLabel });
  });

  it.each(['theme', 'language', 'server', 'updates'] as const)('系统返回先退出 %s 详情，首页再返回才关闭', async (page) => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    const title = page === 'updates'
      ? 'updates.title'
      : page === 'theme'
        ? 'settings.rows.theme'
        : page === 'server'
          ? 'settings.rows.server'
          : 'sidebar.language.label';
    await fireEvent.press(result.getByRole('button', { name: title }));
    await fireEvent(result.getByRole('header', { name: title }), 'requestClose');
    expect(result.getByRole('header', { name: 'sidebar.settings' })).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();
    await fireEvent(result.getByRole('header', { name: 'sidebar.settings' }), 'requestClose');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it.each(['home', 'theme', 'language', 'server', 'updates'] as const)('在 %s 页面点击关闭仅触发 onClose', async (page) => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    if (page === 'theme') await fireEvent.press(result.getByRole('button', { name: 'settings.rows.theme' }));
    if (page === 'language') await fireEvent.press(result.getByRole('button', { name: 'sidebar.language.label' }));
    if (page === 'server') await fireEvent.press(result.getByRole('button', { name: 'settings.rows.server' }));
    if (page === 'updates') await fireEvent.press(result.getByRole('button', { name: 'updates.title' }));
    await fireEvent.press(result.getByRole('button', { name: 'common.dismiss' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onLogout).not.toHaveBeenCalled();
  });

  it('关闭再打开不保留详情页状态，但保留父层偏好', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'sidebar.language.label' }));
    await result.rerender(<PreferencesModal {...props} visible={false} />);
    expect(result.toJSON()).toBeNull();
    await result.rerender(<PreferencesModal {...props} preferences={{ ...preferences, theme: 'dark', language: 'zh-CN' }} />);
    expect(result.getByRole('header', { name: 'sidebar.settings' })).toBeTruthy();
    expect(result.queryAllByRole('radio')).toHaveLength(0);
    expect(result.getByText('简体中文')).toBeTruthy();
    expect(result.getByText('settings.values.dark')).toBeTruthy();
  });

  it.each([LIGHT_COLORS, DARK_COLORS])('首页和选择页使用传入的明暗调色板', async (colors) => {
    const result = await render(<PreferencesModal {...createProps()} colors={colors} />);
    expect(result.getByRole('header', { name: 'sidebar.settings' })).toHaveStyle({ color: colors.foreground });
    expect(result.getByText('settings.preferences.note')).toHaveStyle({ color: colors.muted });
    expect(result.getByText('app.account.logout')).toHaveStyle({ color: colors.errorText });
    await fireEvent.press(result.getByRole('button', { name: 'sidebar.language.label' }));
    expect(result.getByText('English')).toHaveStyle({ color: colors.foreground });
  });

  it.each([
    { summary: 'updates.checking', overrides: { checkStatus: 'checking' } },
    { summary: 'updates.noPublished', overrides: { checkStatus: 'checked' } },
    { summary: 'updates.upToDate', overrides: { checkStatus: 'checked', candidate: createCandidate(), runtime: { ...createUpdates().runtime, versionCode: createCandidate().versionCode } } },
    { summary: 'updates.errors.network', overrides: { checkStatus: 'error', checkError: 'network' } },
    { summary: 'updates.unsupported', overrides: { runtime: { ...createUpdates().runtime, supported: false } } },
  ] satisfies { summary: string; overrides: Partial<UpdateState> }[])('首页更新行使用 controller 摘要 $summary，不自动检查', async ({ summary, overrides }) => {
    const updates = createUpdates(overrides);
    const result = await render(<PreferencesModal {...createProps()} updates={updates} />);
    expect(result.getByRole('button', { name: 'updates.title' })).toHaveAccessibilityValue({ text: summary });
    expectNoUpdateActions(updates);
  });

  it('有更新时显示徽标，点击更新行进入真实详情并展示候选版本、日期和说明', async () => {
    const updates = createUpdates({ candidate: createCandidate(), checkStatus: 'checked', lastCheckedAt: Date.parse('2026-10-07T09:00:00Z') });
    const result = await render(<PreferencesModal {...createProps()} updates={updates} />);
    expect(result.getByRole('button', { name: 'updates.title' })).toHaveAccessibilityValue({ text: 'updates.available' });
    expect(result.getByTestId('settings-update-badge').props.accessibilityLabel).toBe('updates.updateAvailableA11y');
    await fireEvent.press(result.getByRole('button', { name: 'updates.title' }));
    expect(result.getByRole('header', { name: 'updates.title' })).toBeTruthy();
    expect(result.getByText('updates.hint')).toBeTruthy();
    expect(result.getByText('1.0.6 (106)')).toBeTruthy();
    expect(result.getByText(updates.candidate!.version)).toBeTruthy();
    expect(result.getByText(new Date(updates.candidate!.publishedAt).toLocaleString('en'))).toBeTruthy();
    expect(result.getByText('2.0 MB')).toBeTruthy();
    expect(result.getByText(updates.candidate!.notes)).toBeTruthy();
    expectNoUpdateActions(updates);
  });

  it('返回和关闭只重置详情导航，重新打开保留 controller 的候选更新与下载进度', async () => {
    const props = createProps();
    const updates = createUpdates({ candidate: createCandidate(), stage: 'downloading', downloadedBytes: 1048576 });
    const result = await render(<PreferencesModal {...props} updates={updates} />);
    await fireEvent.press(result.getByRole('button', { name: 'updates.title' }));
    expect(progressNode(result)).toHaveAccessibilityValue({ min: 0, max: 100, now: 50 });
    await fireEvent.press(result.getByRole('button', { name: 'settings.preferences.back' }));
    expect(result.getByTestId('settings-update-badge')).toBeTruthy();
    await fireEvent.press(result.getByRole('button', { name: 'updates.title' }));
    await fireEvent.press(result.getByRole('button', { name: 'common.dismiss' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await result.rerender(<PreferencesModal {...props} updates={updates} visible={false} />);
    expect(result.toJSON()).toBeNull();
    await result.rerender(<PreferencesModal {...props} updates={updates} />);
    expect(result.getByRole('header', { name: 'sidebar.settings' })).toBeTruthy();
    expect(result.getByTestId('settings-update-badge')).toBeTruthy();
    await fireEvent.press(result.getByRole('button', { name: 'updates.title' }));
    expect(result.getByText('updates.downloading')).toBeTruthy();
    expect(progressNode(result)).toHaveAccessibilityValue({ now: 50 });
    expect(updates.downloadedBytes).toBe(1048576);
    expectNoUpdateActions(updates);
  });

  it('只有手动点击检查更新才调用 check(true)，检查期间按钮不可重复触发', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'updates.title' }));
    expectNoUpdateActions(props.updates);
    await fireEvent.press(result.getByRole('button', { name: 'updates.check' }));
    expect(props.updates.check).toHaveBeenCalledTimes(1);
    expect(props.updates.check).toHaveBeenCalledWith(true);
    // 检查结果由父层传回；不 mock 详情组件，也不让测试 fixture 自行改变状态。
    await result.rerender(<PreferencesModal {...props} updates={{ ...props.updates, checkStatus: 'checking' }} />);
    expect(result.getByRole('button', { name: 'updates.checking' })).toBeDisabled();
    await fireEvent.press(result.getByRole('button', { name: 'updates.checking' }));
    expect(props.updates.check).toHaveBeenCalledTimes(1);
    expect(props.updates.download).not.toHaveBeenCalled();
    expect(props.updates.install).not.toHaveBeenCalled();
  });

  it.each([
    { stage: 'idle', label: 'updates.download', callback: 'download' },
    { stage: 'ready', label: 'updates.install', callback: 'install' },
    { stage: 'ready', label: 'updates.permission', callback: 'permission' },
  ] as const)('$label 仅委派给对应 controller 动作，不关闭弹窗或修改偏好', async ({ stage, label, callback }) => {
    const props = createProps();
    const updates = createUpdates({ candidate: createCandidate(), stage, verifiedUri: stage === 'ready' ? 'file:///verified-update.apk' : null });
    const result = await render(<PreferencesModal {...props} updates={updates} />);
    await fireEvent.press(result.getByRole('button', { name: 'updates.title' }));
    expectNoUpdateActions(updates);
    await fireEvent.press(result.getByRole('button', { name: label }));
    expect(updates[callback]).toHaveBeenCalledTimes(1);
    expect(updates[callback]).toHaveBeenCalledWith();
    (['check', 'download', 'install', 'permission', 'cancel'] as const)
      .filter((name) => name !== callback)
      .forEach((name) => expect(updates[name]).not.toHaveBeenCalled());
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onLogout).not.toHaveBeenCalled();
  });

  it.each(['downloading', 'verifying'] as const)('%s 阶段显示进度并禁用检查，取消按钮只调用 cancel', async (stage) => {
    const updates = createUpdates({ candidate: createCandidate(), stage, downloadedBytes: 1048576 });
    const result = await render(<PreferencesModal {...createProps()} updates={updates} />);
    await fireEvent.press(result.getByRole('button', { name: 'updates.title' }));
    expect(result.getByText('updates.' + stage)).toBeTruthy();
    expect(progressNode(result)).toHaveAccessibilityValue({ min: 0, max: 100, now: 50 });
    expect(result.getByRole('button', { name: 'updates.check' })).toBeDisabled();
    expect(result.queryByRole('button', { name: 'updates.download' })).toBeNull();
    expect(result.queryByRole('button', { name: 'updates.install' })).toBeNull();
    await fireEvent.press(result.getByRole('button', { name: 'updates.check' }));
    await fireEvent.press(result.getByRole('button', { name: 'updates.cancel' }));
    expect(updates.cancel).toHaveBeenCalledTimes(1);
    expect(updates.check).not.toHaveBeenCalled();
    expect(updates.download).not.toHaveBeenCalled();
    expect(updates.install).not.toHaveBeenCalled();
  });

  it.each(['idle', 'ready'] as const)('开发模式的 %s 状态不提供下载、安装或安装权限按钮，但允许手动检查', async (stage) => {
    const updates = createUpdates({ candidate: createCandidate(), stage, runtime: { ...createUpdates().runtime, development: true } });
    const result = await render(<PreferencesModal {...createProps()} updates={updates} />);
    await fireEvent.press(result.getByRole('button', { name: 'updates.title' }));
    expect(result.getByText('updates.development')).toBeTruthy();
    ['updates.download', 'updates.install', 'updates.permission'].forEach((name) => {
      expect(result.queryByRole('button', { name })).toBeNull();
    });
    expectNoUpdateActions(updates);
    await fireEvent.press(result.getByRole('button', { name: 'updates.check' }));
    expect(updates.check).toHaveBeenCalledWith(true);
    expect(updates.download).not.toHaveBeenCalled();
    expect(updates.install).not.toHaveBeenCalled();
    expect(updates.permission).not.toHaveBeenCalled();
  });

  it('退出先关闭弹窗，再调用 onLogout，不更改偏好', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'app.account.logout' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onLogout).toHaveBeenCalledTimes(1);
    expect(props.onClose.mock.invocationCallOrder[0]).toBeLessThan(props.onLogout.mock.invocationCallOrder[0]);
    expect(props.onChange).not.toHaveBeenCalled();
  });
});
