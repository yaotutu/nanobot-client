import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useAuthBootstrapLifecycle } from '@/features/app/hooks/use-auth-bootstrap-lifecycle';

const mockBootstrapFromStorage = jest.fn(async () => undefined);
const mockAuthState = { bootstrapFromStorage: mockBootstrapFromStorage };

jest.mock('@/features/auth/store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
    { getState: () => mockAuthState },
  ),
}));

describe('useAuthBootstrapLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('只在启动壳首次挂载时恢复一次本地鉴权状态', async () => {
    const { rerender } = await renderHook(() => useAuthBootstrapLifecycle());

    await waitFor(() => expect(mockBootstrapFromStorage).toHaveBeenCalledTimes(1));
    rerender(undefined);
    expect(mockBootstrapFromStorage).toHaveBeenCalledTimes(1);
  });
});
