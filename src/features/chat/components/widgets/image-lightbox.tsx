/**
 * 图片附件的全屏分页查看器。
 *
 * 外部组件持有当前索引，本组件只同步 FlatList 滚动位置并回报手势后的新索引，避免 modal
 * 内部状态与缩略图选中状态形成两份真相。
 */
import { Image as ExpoImage } from 'expo-image';
import X from 'lucide-react-native/icons/x';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { UIMediaAttachment } from '@/types/api/chat/media';

export function ImageLightbox({
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

const styles = StyleSheet.create({
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  fill: { width: '100%', height: '100%' },
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
