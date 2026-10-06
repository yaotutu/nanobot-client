import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { PreferencesModal } from '@/features/settings/components/PreferencesModal';
import { supportedLocales } from '@/i18n/config';
import { apiClient } from '@/services/api/api';
import type { LocalPreferences } from '@/stores/local-preferences-store';
import { LIGHT_COLORS } from '@/ui/colors';

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

  afterEach(() => {
    // 恢复全局网络函数，确保本文件不会影响其他并行开发中的 native 测试。
    jest.restoreAllMocks();
  });

  it('隐藏时不渲染内容，也不触发业务回调', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} visible={false} />);

    expect(result.toJSON()).toBeNull();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onLogout).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('仅展示主题、语言和退出登录，以及弹窗标题与关闭按钮', async () => {
    const result = await render(<PreferencesModal {...createProps()} />);

    // 精确匹配全部可见文字及可操作控件数量，避免旧服务端设置入口悄悄回归。
    expect(result.getAllByText(/.+/).map((node) => node.props.children)).toEqual([
      'sidebar.settings',
      'common.dismiss',
      'settings.rows.theme',
      'settings.values.light',
      'settings.values.dark',
      'sidebar.language.label',
      ...supportedLocales.map((locale) => locale.nativeLabel),
      'app.account.logout',
    ]);
    expect(result.getAllByRole('radio')).toHaveLength(2 + supportedLocales.length);
    expect(result.getAllByRole('button')).toHaveLength(2);
    expect(result.getByRole('radio', { name: 'settings.values.light', checked: true })).toBeTruthy();
    expect(result.getByRole('radio', { name: 'English', checked: true })).toBeTruthy();
  });

  it('展示及本地操作均不调用服务端', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);

    await fireEvent.press(result.getByRole('radio', { name: 'settings.values.dark' }));
    await fireEvent.press(result.getByRole('radio', { name: '简体中文' }));
    await fireEvent.press(result.getByRole('button', { name: 'common.dismiss' }));
    await fireEvent.press(result.getByRole('button', { name: 'app.account.logout' }));

    // 退出只委派给父层提供的回调；真实退出请求不属于本地偏好组件的职责。
    expect(props.onLogout).toHaveBeenCalledTimes(1);
    expect(apiClient.request).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(['light', 'dark'] as const)('选择主题 %s 时只变更 theme', async (theme) => {
    const props = createProps();
    const currentPreferences: LocalPreferences = {
      ...preferences,
      theme: theme === 'light' ? 'dark' : 'light',
    };
    const result = await render(<PreferencesModal {...props} preferences={currentPreferences} />);

    await fireEvent.press(result.getByRole('radio', { name: `settings.values.${theme}` }));

    const next = { ...currentPreferences, theme };
    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith(next);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onLogout).not.toHaveBeenCalled();
    // 此组件受控：父层回传新偏好后，选中状态才随之更新。
    await result.rerender(<PreferencesModal {...props} preferences={next} />);
    expect(result.getByRole('radio', { name: `settings.values.${theme}`, checked: true })).toBeTruthy();
  });

  it.each(supportedLocales)('选择语言 $code 时只变更 language', async (locale) => {
    const props = createProps();
    const currentPreferences: LocalPreferences = {
      ...preferences,
      language: locale.code === 'en' ? 'zh-CN' : 'en',
    };
    const result = await render(<PreferencesModal {...props} preferences={currentPreferences} />);

    await fireEvent.press(result.getByRole('radio', { name: locale.nativeLabel }));

    const next = { ...currentPreferences, language: locale.code };
    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith(next);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onLogout).not.toHaveBeenCalled();
    await result.rerender(<PreferencesModal {...props} preferences={next} />);
    expect(result.getByRole('radio', { name: locale.nativeLabel, checked: true })).toBeTruthy();
  });

  it('点击关闭按钮仅触发 onClose', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);

    await fireEvent.press(result.getByRole('button', { name: 'common.dismiss' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onLogout).not.toHaveBeenCalled();
  });

  it('原生 Modal 请求关闭时触发 onClose', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);

    // 系统返回键走 onRequestClose，独立于界面上的关闭按钮；
    // 从标题向上查找事件处理器，使用测试库公开事件 API，避免依赖 renderer 内部查询。
    await fireEvent(result.getByRole('header', { name: 'sidebar.settings' }), 'requestClose');

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onLogout).not.toHaveBeenCalled();
  });

  it('点击退出时先关闭弹窗，再调用 onLogout', async () => {
    const props = createProps();
    const result = await render(<PreferencesModal {...props} />);

    await fireEvent.press(result.getByRole('button', { name: 'app.account.logout' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onLogout).toHaveBeenCalledTimes(1);
    expect(props.onClose.mock.invocationCallOrder[0]).toBeLessThan(props.onLogout.mock.invocationCallOrder[0]);
    expect(props.onChange).not.toHaveBeenCalled();
  });
});
