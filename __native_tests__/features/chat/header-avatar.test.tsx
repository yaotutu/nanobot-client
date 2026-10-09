import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import React from 'react';

import { HeaderAvatar, type HeaderAvatarAsset } from '@/features/chat/components/HeaderAvatar';
import type { HeaderActivity } from '@/features/chat/activity/model/header-activity';

// 头像未来会接入 expo-video；测试中保留一个可查询的 View 桩，避免启动原生播放器。
jest.mock('expo-video', () => {
  const react = jest.requireActual<typeof React>('react');
  const reactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useVideoPlayer: jest.fn(() => ({
      loop: false,
      muted: false,
      play: jest.fn(async () => undefined),
      pause: jest.fn(),
    })),
    VideoView: ({ testID }: { testID?: string }) => react.createElement(reactNative.View, { testID }),
  };
});

const phases: HeaderActivity['phase'][] = [
  'idle',
  'thinking',
  'waiting',
  'tool',
  'file',
  'replying',
  'done',
  'error',
];

/** 生成“每个状态都是同一种素材”的最小映射，便于测试图片和视频两条渲染路径。 */
const createAssets = (asset: HeaderAvatarAsset): Record<HeaderActivity['phase'], HeaderAvatarAsset> =>
  Object.fromEntries(phases.map((phase) => [phase, asset])) as Record<
    HeaderActivity['phase'],
    HeaderAvatarAsset
  >;

describe('顶部工作状态头像', () => {
  it.each(phases)('默认为 %s 状态渲染图片素材，保留未来素材替换入口', async (phase) => {
    const result = await render(<HeaderAvatar phase={phase} />);
    expect(result.getByTestId('header-avatar-image')).toBeTruthy();
    expect(result.getByTestId('header-avatar-image').props.resizeMode).toBe('contain');
    expect(result.queryByTestId('header-avatar-video')).toBeNull();
  });

  it('素材为视频时走 expo-video 渲染路径，并隐藏原生控件', async () => {
    const result = await render(
      <HeaderAvatar
        phase="tool"
        assets={createAssets({ kind: 'video', source: 101 })}
      />,
    );
    expect(result.getByTestId('header-avatar-video')).toBeTruthy();
    expect(result.queryByTestId('header-avatar-image')).toBeNull();
  });
});
