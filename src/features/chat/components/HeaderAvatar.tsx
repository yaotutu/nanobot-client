import { useEffect, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  type ImageSourcePropType,
} from 'react-native';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';

import type { HeaderActivity } from '@/features/chat/activity/model/header-activity';

// Metro 静态资源必须使用 require，保证图片进入 Android/iOS/Web 的原生包。
// 这些是临时占位素材，后面拿到正式形象后，直接替换 assets/images/header-avatar/ 下同名 GIF 即可。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const avatarIdle = require('../../../../assets/images/header-avatar/idle.gif');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const avatarThinking = require('../../../../assets/images/header-avatar/thinking.gif');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const avatarWaiting = require('../../../../assets/images/header-avatar/waiting.gif');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const avatarTool = require('../../../../assets/images/header-avatar/tool.gif');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const avatarFile = require('../../../../assets/images/header-avatar/file.gif');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const avatarReplying = require('../../../../assets/images/header-avatar/replying.gif');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const avatarDone = require('../../../../assets/images/header-avatar/done.gif');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const avatarError = require('../../../../assets/images/header-avatar/error.gif');

/**
 * 头像素材的统一描述。
 *
 * - image：支持 PNG / GIF / APNG；状态专属动态图只需要替换 source。
 * - video：支持本地 require 的视频或远程 URL；后续小企鹅敲电脑素材可直接放进来。
 */
export type HeaderAvatarAsset =
  | { kind: 'image'; animated?: boolean; source: ImageSourcePropType }
  | { kind: 'video'; source: VideoSource };

interface HeaderAvatarProps {
  phase: HeaderActivity['phase'];
  size?: number;
  /**
   * 状态素材映射。默认指向各状态的临时动态图；
   * 后续只需要修改这一个对象，就能按状态替换正式动态图或短视频。
   */
  assets?: Record<HeaderActivity['phase'], HeaderAvatarAsset>;
}

/** 静态图兜底时的工作状态动画模型：idle 回到原位，active 持续轻动，done/error 单次反馈。 */
type AvatarMotion =
  | { kind: 'idle' }
  | { kind: 'active'; durationMs: number; distance: number; scale: number }
  | { kind: 'done' }
  | { kind: 'error' };

/** 把顶部活动状态映射成静态图兜底运动参数；GIF/视频素材自己负责播放动画。 */
function toAvatarMotion(phase: HeaderActivity['phase']): AvatarMotion {
  if (phase === 'idle') return { kind: 'idle' };
  if (phase === 'done') return { kind: 'done' };
  if (phase === 'error') return { kind: 'error' };

  // 工作中的状态共用“轻微呼吸 + 上下浮动”的节奏，不同 phase 使用不同速度和幅度。
  const motions: Record<
    Exclude<HeaderActivity['phase'], 'idle' | 'done' | 'error'>,
    Extract<AvatarMotion, { kind: 'active' }>
  > = {
    waiting: { kind: 'active', durationMs: 1_300, distance: 1, scale: 1.02 },
    thinking: { kind: 'active', durationMs: 950, distance: 1.6, scale: 1.028 },
    tool: { kind: 'active', durationMs: 850, distance: 1.8, scale: 1.03 },
    file: { kind: 'active', durationMs: 1_000, distance: 1.5, scale: 1.025 },
    replying: { kind: 'active', durationMs: 700, distance: 2, scale: 1.035 },
  };
  return motions[phase];
}

/** 默认素材入口：当前使用基于现有品牌图生成的临时动态图，后续替换这里即可。 */
const defaultHeaderAvatarAssets: Record<HeaderActivity['phase'], HeaderAvatarAsset> = {
  idle: { kind: 'image', animated: true, source: avatarIdle },
  thinking: { kind: 'image', animated: true, source: avatarThinking },
  waiting: { kind: 'image', animated: true, source: avatarWaiting },
  tool: { kind: 'image', animated: true, source: avatarTool },
  file: { kind: 'image', animated: true, source: avatarFile },
  replying: { kind: 'image', animated: true, source: avatarReplying },
  done: { kind: 'image', animated: true, source: avatarDone },
  error: { kind: 'image', animated: true, source: avatarError },
};

/** 顶部动态头像；状态与活动胶囊共用同一个 HeaderActivity，天然保持同步。 */
export function HeaderAvatar({
  phase,
  size = 49,
  assets = defaultHeaderAvatarAssets,
}: HeaderAvatarProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const [translateY] = useState(() => new Animated.Value(0));
  const [translateX] = useState(() => new Animated.Value(0));
  const asset = assets[phase];

  useEffect(() => {
    // 视频素材由 HeaderAvatarVideo 子组件负责播放；动图素材自己播放，静态图才使用占位动画。
    if (asset.kind === 'video' || asset.animated) return undefined;

    const motion = toAvatarMotion(phase);

    if (motion.kind === 'idle') {
      const reset = Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]);
      reset.start();
      return () => reset.stop();
    }

    if (motion.kind === 'active') {
      const breathing = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scale, { toValue: motion.scale, duration: motion.durationMs, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: -motion.distance, duration: motion.durationMs, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: motion.durationMs, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: motion.durationMs, useNativeDriver: true }),
          ]),
        ]),
      );
      breathing.start();
      return () => breathing.stop();
    }

    if (motion.kind === 'done') {
      const success = Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: 150, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]);
      success.start();
      return () => success.stop();
    }

    const error = Animated.sequence([
      Animated.timing(translateX, { toValue: -2, duration: 60, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 2, duration: 60, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]);
    error.start();
    return () => error.stop();
  }, [asset, phase, scale, translateX, translateY]);

  return (
    <Animated.View
      accessible={false}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          transform: [
            { translateX: asset.kind === 'video' ? 0 : translateX },
            { translateY: asset.kind === 'video' ? 0 : translateY },
            { scale: asset.kind === 'video' ? 1 : scale },
          ],
        },
      ]}
    >
      {asset.kind === 'video' ? (
        <HeaderAvatarVideo source={asset.source} />
      ) : (
        <Image
          accessible={false}
          source={asset.source}
          resizeMode="contain"
          style={styles.fill}
          testID="header-avatar-image"
        />
      )}
    </Animated.View>
  );
}

/** 顶层头像的视频渲染器；只有素材真正是视频时才会创建和使用 expo-video 播放器。 */
function HeaderAvatarVideo({ source }: { source: VideoSource }) {
  const player = useVideoPlayer(source, (videoPlayer) => {
    // 状态视频需要长时间循环展示；头像场景没有声音，也必须隐藏用户控制。
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });

  useEffect(() => {
    void player.play();
    return () => player.pause();
  }, [player]);

  return (
    <VideoView
      accessible={false}
      contentFit="contain"
      nativeControls={false}
      player={player}
      pointerEvents="none"
      style={styles.fill}
      testID="header-avatar-video"
    />
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
});
