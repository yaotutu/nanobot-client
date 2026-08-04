/**
 * 消息中的内联视频播放器。
 *
 * 使用 Expo SDK 57 的 expo-video useVideoPlayer/VideoView API；播放器生命周期由 hook 管理，
 * 组件只根据消息对齐方式和屏幕宽度计算稳定的 16:9 展示区域。
 */
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { UIMediaAttachment } from '@/types/api/chat/media';

import type { MediaPalette } from './message-media-model';

export function InlineVideoAttachment({
  align,
  attachment,
  colors,
}: {
  align: 'left' | 'right';
  attachment: UIMediaAttachment;
  colors: MediaPalette;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const source = attachment.url ?? null;
  const player = useVideoPlayer(source);
  const videoWidth = Math.min(align === 'right' ? 320 : 512, Math.max(220, width - 50));
  const videoHeight = Math.round(videoWidth * 9 / 16);

  return (
    <View
      accessibilityLabel={attachment.name
        ? t('message.videoAttachmentNamed', {
            defaultValue: 'Video attachment: {{name}}',
            name: attachment.name,
          })
        : t('message.videoAttachment', { defaultValue: 'Video attachment' })}
      style={[
        styles.videoTile,
        { width: videoWidth, height: videoHeight, borderColor: colors.border },
      ]}
    >
      <VideoView
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        nativeControls
        player={player}
        style={styles.fill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  videoTile: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    backgroundColor: '#000000',
  },
  fill: { width: '100%', height: '100%' },
});
