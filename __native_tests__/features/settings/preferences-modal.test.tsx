import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { PreferencesModal } from '@/features/settings/components/PreferencesModal';
import { supportedLocales } from '@/i18n/config';
import { apiClient } from '@/services/api/api';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import { DARK_COLORS, LIGHT_COLORS } from '@/ui/colors';

// 仅隔离 Jest 无法直接加载的装饰性 ESM 图标，仍测试真实列表与 Modal 交互。
jest.mock('lucide-react-native/icons/arrow-left', () => () => null);
jest.mock('lucide-react-native/icons/check', () => () => null);
jest.mock('lucide-react-native/icons/chevron-right', () => () => null);
jest.mock('lucide-react-native/icons/languages', () => () => null);
jest.mock('lucide-react-native/icons/log-out', () => () => null);
jest.mock('lucide-react-native/icons/moon', () => () => null);
jest.mock('lucide-react-native/icons/sun', () => () => null);
jest.mock('lucide-react-native/icons/x', () => () => null);

// 返回翻译 key，直接验证弹窗使用的文案契约，避免语言资源或异步初始化影响断言。
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
const preferences = Object.freeze<LocalPreferences>({
  theme: 'light',
  language: 'en',
});

const createProps = () => ({
  colors: LIGHT_COLORS,
  preferences,
  visible: true,
  onChange: jest.fn<(next: LocalPreferences) => void>(),
  onClose: jest.fn<() => void>(),
  onLogout: jest.fn(async () => undefined),
});

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
  });

  it('首页只展示主题和语言摘要，退出单独分组，不平铺全部选项', async () => {
    const result = await render(<PreferencesModal {...createProps()} />);
    expect(result.getAllByText(/.+/).map((node) => node.props.children)).toEqual([
      'sidebar.settings', 'settings.preferences.note', 'settings.preferences.group',
      'settings.rows.theme', 'settings.values.light', 'sidebar.language.label', 'English',
      'settings.preferences.account', 'app.account.logout',
    ]);
    expect(result.queryAllByRole('radio')).toHaveLength(0);
    expect(result.getAllByRole('button')).toHaveLength(4);
    expect(result.getByRole('button', { name: 'settings.rows.theme' })).toHaveAccessibilityValue({ text: 'settings.values.light' });
    expect(result.getByRole('button', { name: 'sidebar.language.label' })).toHaveAccessibilityValue({ text: 'English' });
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

  it.each(['theme', 'language'] as const)('系统返回先退出 %s 详情，首页再返回才关闭', async (page) => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    const title = page === 'theme' ? 'settings.rows.theme' : 'sidebar.language.label';
    await fireEvent.press(result.getByRole('button', { name: title }));
    await fireEvent(result.getByRole('header', { name: title }), 'requestClose');
    expect(result.getByRole('header', { name: 'sidebar.settings' })).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();
    await fireEvent(result.getByRole('header', { name: 'sidebar.settings' }), 'requestClose');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it.each(['home', 'theme', 'language'] as const)('在 %s 页面点击关闭仅触发 onClose', async (page) => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);
    if (page !== 'home') await fireEvent.press(result.getByRole('button', { name: page === 'theme' ? 'settings.rows.theme' : 'sidebar.language.label' }));
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
    await result.rerender(<PreferencesModal {...props} preferences={{ theme: 'dark', language: 'zh-CN' }} />);
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
