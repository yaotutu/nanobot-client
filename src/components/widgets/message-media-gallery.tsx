import { Image as ExpoImage } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FileText, Maximize2, Play, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { toMediaAttachment } from '@/services/media';
import type { UIImage, UIMediaAttachment } from '@/types/api';

interface MediaPalette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
}

interface MessageMediaGalleryProps {
  align: 'left' | 'right';
  colors: MediaPalette;
  images?: UIImage[];
  media?: UIMediaAttachment[];
}

export function MessageMediaGallery({
  align,
  colors,
  images = [],
  media = [],
}: MessageMediaGalleryProps) {
  const { t } = useTranslation();
  const attachments = useMemo(() => uniqueAttachments([
    ...images.map((image) => toMediaAttachment({ ...image, kind: 'image' })),
    ...media.map((attachment) => toMediaAttachment(attachment)),
  ]), [images, media]);
  const viewableImages = useMemo(
    () => attachments.filter((attachment) => attachment.kind === 'image' && attachment.url),
    [attachments],
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (!attachments.length) return null;

  return (
    <>
      <View style={[styles.gallery, align === 'right' ? styles.galleryRight : styles.galleryLeft]}>
        {attachments.map((attachment, index) => {
          const imageIndex = attachment.kind === 'image' && attachment.url
            ? viewableImages.findIndex((candidate) => candidate.url === attachment.url)
            : -1;
          if (attachment.kind === 'image' && attachment.url) {
            return (
              <Pressable
                accessibilityLabel={t('lightbox.openNamed', {
                  defaultValue: 'View image {{name}}',
                  name: attachment.name || index + 1,
                })}
                accessibilityRole="imagebutton"
                key={`${attachment.url}-${index}`}
                onPress={() => setLightboxIndex(Math.max(0, imageIndex))}
                style={({ pressed }) => [
                  styles.imageTile,
                  align === 'left' ? styles.imageLarge : styles.imageCompact,
                  { borderColor: colors.border, opacity: pressed ? 0.82 : 1 },
                ]}
              >
                <ExpoImage contentFit="cover" source={{ uri: attachment.url }} style={styles.fill} />
                <View style={styles.expandBadge}>
                  <Maximize2 color="#FFFFFF" size={12} strokeWidth={2} />
                </View>
              </Pressable>
            );
          }
          if (attachment.kind === 'video' && attachment.url) {
            return (
              <InlineVideoAttachment
                align={align}
                attachment={attachment}
                colors={colors}
                key={`${attachment.url}-${index}`}
              />
            );
          }
          const canOpen = Boolean(attachment.url);
          return (
            <Pressable
              accessibilityHint={canOpen
                ? t('message.openWithSystemApp', { defaultValue: 'Open with a system app' })
                : undefined}
              accessibilityLabel={attachment.name || (attachment.kind === 'video'
                ? t('message.videoAttachment', { defaultValue: 'Video attachment' })
                : t('message.fileAttachment', { defaultValue: 'File attachment' }))}
              disabled={!canOpen}
              key={`${attachment.name ?? attachment.url ?? attachment.kind}-${index}`}
              onPress={() => {
                if (attachment.url) void Linking.openURL(attachment.url).catch(() => undefined);
              }}
              style={({ pressed }) => [
                styles.fileTile,
                { borderColor: colors.border, backgroundColor: colors.card },
                pressed && { backgroundColor: colors.pressed },
              ]}
            >
              {attachment.kind === 'video'
                ? <Play color={colors.muted} fill={colors.muted} size={15} strokeWidth={1.5} />
                : <FileText color={colors.muted} size={16} strokeWidth={1.7} />}
              <View style={styles.fileBody}>
                <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>                  {attachment.name || (attachment.kind === 'video'
                    ? t('message.video', { defaultValue: 'Video' })
                    : t('message.attachment', { defaultValue: 'Attachment' }))}
                </Text>
                <Text style={[styles.fileHint, { color: colors.subtle }]}>                  {canOpen
                    ? t('message.tapToOpen', { defaultValue: 'Tap to open' })
                    : t('message.attachmentUnavailable', { defaultValue: 'Attachment unavailable' })}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <ImageLightbox
        images={viewableImages}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}

function InlineVideoAttachment({
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

function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: UIMediaAttachment[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<UIMediaAttachment>>(null);
  const visible = index !== null && images.length > 0;
  const safeIndex = Math.min(Math.max(index ?? 0, 0), Math.max(0, images.length - 1));

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ animated: false, index: safeIndex });
    }, 0);
    return () => clearTimeout(timer);
  }, [safeIndex, visible, width]);

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
    if (next >= 0 && next < images.length) onIndexChange(next);
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.lightbox}>
        <FlatList
          data={images}
          getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          horizontal
          initialScrollIndex={safeIndex}
          keyExtractor={(item, itemIndex) => `${item.url}-${itemIndex}`}
          onMomentumScrollEnd={onMomentumScrollEnd}
          pagingEnabled
          ref={listRef}
          renderItem={({ item }) => (
            <View style={{ width, height, paddingHorizontal: 12, paddingVertical: 58 }}>
              {item.url ? (
                <ExpoImage contentFit="contain" source={{ uri: item.url }} style={styles.fill} />
              ) : null}
            </View>
          )}
          showsHorizontalScrollIndicator={false}
        />
        <Pressable
          accessibilityLabel={t('lightbox.close')}
          hitSlop={12}
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.lightboxPressed]}
        >
          <X color="#FFFFFF" size={22} strokeWidth={1.9} />
        </Pressable>
        <View style={styles.lightboxFooter}>
          {images[safeIndex]?.name ? (
            <Text numberOfLines={1} style={styles.lightboxName}>{images[safeIndex]?.name}</Text>
          ) : null}
          {images.length > 1 ? (
            <Text style={styles.lightboxCount}>{safeIndex + 1} / {images.length}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function uniqueAttachments(attachments: UIMediaAttachment[]): UIMediaAttachment[] {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = `${attachment.kind}\u0000${attachment.url ?? ''}\u0000${attachment.name ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(attachment.url || attachment.name);
  });
}

const styles = StyleSheet.create({
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  galleryLeft: { alignSelf: 'flex-start' },
  galleryRight: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  videoTile: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, backgroundColor: '#000000' },
  imageTile: { overflow: 'hidden', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  imageCompact: { width: 148, height: 112 },
  imageLarge: { width: 218, height: 164 },
  fill: { width: '100%', height: '100%' },
  expandBadge: {
    position: 'absolute',
    right: 7,
    top: 7,
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.54)',
  },
  fileTile: {
    minWidth: 176,
    maxWidth: 260,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  fileBody: { minWidth: 0, flex: 1, gap: 1 },
  fileName: { fontSize: 12.5, fontWeight: '600' },
  fileHint: { fontSize: 10.5 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  closeButton: {
    position: 'absolute',
    right: 18,
    top: 48,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  lightboxPressed: { backgroundColor: 'rgba(255,255,255,0.24)' },
  lightboxFooter: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 34,
    alignItems: 'center',
    gap: 5,
  },
  lightboxName: { maxWidth: '90%', color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  lightboxCount: { color: 'rgba(255,255,255,0.72)', fontSize: 11.5, fontVariant: ['tabular-nums'] },
});
