import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { AppStateStatus } from 'react-native';
import { useUpdateLifecycle } from '@/features/updates/hooks';
import { CHECK_INTERVAL } from '@/features/updates/model';

const mockCheck = jest.fn<() => Promise<void>>(async () => {});
const mockRemove = jest.fn();
let mockCurrentState: AppStateStatus = 'active';
let mockListener: ((state: AppStateStatus) => void) | null = null;
jest.mock('@/features/updates/runtime', () => ({ updateStore: { getState: () => ({ check: mockCheck }) } }));
jest.mock('react-native', () => {
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(actual, { get(target, property, receiver) {
    if (property === 'AppState') return {
      get currentState() { return mockCurrentState; },
      addEventListener: (_event: string, listener: (state: AppStateStatus) => void) => { mockListener = listener; return { remove: mockRemove }; },
    };
    return Reflect.get(target, property, receiver);
  } });
});
describe('更新前台生命周期（无需网关或鉴权）', () => {
  beforeEach(() => { jest.useFakeTimers(); mockCurrentState = 'active'; mockListener = null; });
  afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });
  it('启动检查、每10分钟检查，后台暂停、前台恢复检查', async () => {
    const result = await renderHook(() => useUpdateLifecycle());
    expect(mockCheck).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(CHECK_INTERVAL); });
    expect(mockCheck).toHaveBeenCalledTimes(2);
    await act(async () => { mockListener?.('background'); jest.advanceTimersByTime(CHECK_INTERVAL * 3); });
    expect(mockCheck).toHaveBeenCalledTimes(2);
    await act(async () => { mockListener?.('active'); });
    expect(mockCheck).toHaveBeenCalledTimes(3);
    await result.unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(CHECK_INTERVAL * 2); });
    expect(mockCheck).toHaveBeenCalledTimes(3);
  });
  it('后台启动不检查，重复 active 事件不创建重复计时器', async () => {
    mockCurrentState = 'background';
    await renderHook(() => useUpdateLifecycle()); expect(mockCheck).not.toHaveBeenCalled();
    await act(async () => { mockListener?.('active'); mockListener?.('active'); });
    expect(mockCheck).toHaveBeenCalledTimes(2);
    await act(async () => { jest.advanceTimersByTime(CHECK_INTERVAL); });
    expect(mockCheck).toHaveBeenCalledTimes(3);
  });
});
