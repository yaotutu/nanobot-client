import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { AuthScreen } from '@/features/auth/components/AuthScreen';

// 登录页只需要渲染图标与安全区；这里隔离原生依赖，交互和表单逻辑保持真实实现。
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const createProps = () => ({
  failed: false,
  error: null as string | null,
  serverUrl: 'http://192.168.55.201:8765',
  serverConfigured: true,
  onServerUrlChange: jest.fn<(serverUrl: string) => void>(),
  onSubmit: jest.fn<(secret: string) => Promise<void> | void>(),
});

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('首次进入只要求配置服务器，不出现密码输入框', async () => {
    const props = { ...createProps(), serverConfigured: false };
    const result = await render(<AuthScreen {...props} />);

    expect(result.getByRole('header', { name: 'app.auth.serverTitle' })).toBeTruthy();
    expect(result.getByPlaceholderText('app.auth.serverPlaceholder').props.value).toBe('');
    expect(result.queryByPlaceholderText('app.auth.placeholder')).toBeNull();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('服务器地址合法后先保存地址，再进入密码步骤', async () => {
    const props = { ...createProps(), serverConfigured: false };
    const result = await render(<AuthScreen {...props} />);

    await fireEvent.changeText(result.getByPlaceholderText('app.auth.serverPlaceholder'), 'http://example.test:8765/');
    await fireEvent.press(result.getByRole('button', { name: 'app.auth.serverContinue' }));

    expect(props.onServerUrlChange).toHaveBeenCalledWith('http://example.test:8765');
    expect(result.getByPlaceholderText('app.auth.placeholder')).toBeTruthy();
    expect(result.getByText('http://example.test:8765')).toBeTruthy();
  });

  it('非法服务器地址不能继续到密码步骤', async () => {
    const props = { ...createProps(), serverConfigured: false };
    const result = await render(<AuthScreen {...props} />);

    await fireEvent.changeText(result.getByPlaceholderText('app.auth.serverPlaceholder'), 'not-a-server');
    expect(result.getByRole('button', { name: 'app.auth.serverContinue' })).toBeDisabled();
    await fireEvent.press(result.getByRole('button', { name: 'app.auth.serverContinue' }));

    expect(props.onServerUrlChange).not.toHaveBeenCalled();
    expect(result.queryByPlaceholderText('app.auth.placeholder')).toBeNull();
  });

  it('连接失败时从密码步骤回到服务器配置，修正地址后可重新认证', async () => {
    const props = createProps();
    // 服务器已确认时初始就在密码步骤；连接错误再强制切回服务器步骤。
    const result = await render(<AuthScreen {...props} />);
    expect(result.getByPlaceholderText('app.auth.placeholder')).toBeTruthy();

    // 网关不可达时必须回到服务器步骤；旧错误不能继续把用户锁在密码页。
    await result.rerender(<AuthScreen {...props} error="Gateway unreachable" />);
    expect(result.queryByPlaceholderText('app.auth.placeholder')).toBeNull();
    expect(result.getByText('Gateway unreachable')).toBeTruthy();

    await fireEvent.changeText(
      result.getByPlaceholderText('app.auth.serverPlaceholder'),
      'http://example.test:9000',
    );
    await fireEvent.press(result.getByRole('button', { name: 'app.auth.serverContinue' }));
    // 旧错误已随地址确认被移除；即使外层 error 还没清空，也应能录入密码重试。
    expect(result.getByPlaceholderText('app.auth.placeholder')).toBeTruthy();
    expect(result.queryByText('Gateway unreachable')).toBeNull();

    await fireEvent.changeText(result.getByPlaceholderText('app.auth.placeholder'), 'redhat');
    await fireEvent.press(result.getByRole('button', { name: 'app.auth.submit' }));
    expect(props.onServerUrlChange).toHaveBeenLastCalledWith('http://example.test:9000');
    expect(props.onSubmit).toHaveBeenCalledWith('redhat');
  });

  it('密码错误后重新挂载仍留在密码步骤，且可主动返回修改服务器', async () => {
    const props = createProps();
    let result = await render(<AuthScreen {...props} />);

    await result.unmount();
    // 密码请求期间 AuthScreen 会因 loading 卸载；服务器已确认时重挂载必须直接回到密码步骤。
    result = await render(<AuthScreen {...props} error={null} failed />);
    expect(result.getByPlaceholderText('app.auth.placeholder')).toBeTruthy();
    expect(result.getByText('app.auth.invalid')).toBeTruthy();

    await fireEvent.press(result.getByRole('button', { name: 'app.auth.changeServer' }));
    expect(result.queryByPlaceholderText('app.auth.placeholder')).toBeNull();
    expect(result.getByPlaceholderText('app.auth.serverPlaceholder').props.value).toBe(
      'http://192.168.55.201:8765',
    );
  });
});
