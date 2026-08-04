import { Image as ExpoImage } from 'expo-image';
import FileText from 'lucide-react-native/icons/file-text';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import Play from 'lucide-react-native/icons/play';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { toMediaAttachment } from '@/services/links/media';
import type { UIImage, UIMediaAttachment } from '@/types/api/chat/media';

import { ImageLightbox } from './image-lightbox';
import { InlineVideoAttachment } from './inline-video-attachment';
import { uniqueMediaAttachments, type MediaPalette } from './message-media-model';

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
  const attachments = useMemo(() => uniqueMediaAttachments([
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
                <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>
                  {attachment.name || (attachment.kind === 'video'
                    ? t('message.video', { defaultValue: 'Video' })
                    : t('message.attachment', { defaultValue: 'Attachment' }))}
                </Text>
                <Text style={[styles.fileHint, { color: colors.subtle }]}>
                  {canOpen
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

const styles = StyleSheet.create({
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  galleryLeft: { alignSelf: 'flex-start' },
  galleryRight: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
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
});
