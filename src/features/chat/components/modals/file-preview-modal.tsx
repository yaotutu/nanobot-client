import AlertCircle from 'lucide-react-native/icons/circle-alert';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import X from 'lucide-react-native/icons/x';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchFilePreview } from '@/features/chat/api';

import { HighlightedFile } from './file-preview-highlight';
import {
  compactFilePreviewBreadcrumb,
  previewErrorMessage,
  type FilePreviewPalette,
  type FilePreviewState,
} from './file-preview-model';

interface FilePreviewModalProps {
  colors: FilePreviewPalette;
  dark: boolean;
  path: string | null;
  sessionKey: string | null;
  token: string;
  onClose: () => void;
}

export function FilePreviewModal({
  colors,
  dark,
  path,
  sessionKey,
  token,
  onClose,
}: FilePreviewModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const requestKey = `${sessionKey ?? ''}\n${path ?? ''}`;
  const [result, setResult] = useState<FilePreviewState | null>(null);

  useEffect(() => {
    if (!path || !sessionKey) return;
    let cancelled = false;
    const activeRequestKey = `${sessionKey}\n${path}`;
    void fetchFilePreview(sessionKey, path)
      .then((payload) => {
        if (!cancelled) setResult({ requestKey: activeRequestKey, status: 'ready', payload });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult({
            requestKey: activeRequestKey,
            status: 'error',
            error,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, sessionKey, token]);

  const state = result?.requestKey === requestKey ? result : { status: 'loading' as const };
  const displayPath = state.status === 'ready' ? state.payload.display_path : path ?? '';
  const previewPath = state.status === 'ready' ? state.payload.path : displayPath;
  const breadcrumb = useMemo(() => compactFilePreviewBreadcrumb(previewPath), [previewPath]);

  // Keep closed native modals out of the Fabric tree entirely. Leaving a Modal
  // mounted with visible={false} can still schedule hidden mounting updates on
  // older Android devices while the development launcher is attached.
  if (!path || !sessionKey) return null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible
    >
      <View
        accessibilityLabel={t('filePreview.aria')}
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View accessibilityLabel={previewPath} style={styles.breadcrumb}>
            {breadcrumb.prefix ? (
              <>
                <Text style={[styles.breadcrumbMuted, { color: colors.subtle }]}>{breadcrumb.prefix}</Text>
                <ChevronRight color={colors.subtle} size={14} strokeWidth={1.7} />
              </>
            ) : null}
            {breadcrumb.parts.map((part, index) => {
              const last = index === breadcrumb.parts.length - 1;
              return (
                <View key={`${part}-${index}`} style={styles.breadcrumbPart}>
                  {index > 0 ? <ChevronRight color={colors.subtle} size={14} strokeWidth={1.7} /> : null}
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.breadcrumbText,
                      { color: last ? colors.foreground : colors.muted },
                      last && styles.breadcrumbTitle,
                    ]}
                  >
                    {part}
                  </Text>
                </View>
              );
            })}
          </View>
          <Pressable
            accessibilityLabel={t('filePreview.close')}
            accessibilityRole="button"
            hitSlop={7}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && { backgroundColor: colors.pressed }]}
          >
            <X color={colors.muted} size={18} strokeWidth={1.8} />
          </Pressable>
        </View>

        {state.status === 'loading' ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.muted} />
            <Text style={[styles.stateText, { color: colors.muted }]}>{t('filePreview.loading')}</Text>
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.centerState}>
            <AlertCircle color={colors.errorText} size={22} strokeWidth={1.8} />
            <Text style={[styles.errorText, { color: colors.muted }]}>{previewErrorMessage(state.error)}</Text>
          </View>
        ) : (
          <View style={styles.content}>
            {state.payload.truncated ? (
              <View style={styles.truncatedBanner}>
                <Text style={styles.truncatedText}>{t('filePreview.truncated')}</Text>
              </View>
            ) : null}
            <ScrollView
              contentInsetAdjustmentBehavior="automatic"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={styles.verticalScroll}
            >
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator
                contentContainerStyle={styles.horizontalContent}
              >
                <HighlightedFile
                  code={state.payload.content}
                  colors={colors}
                  dark={dark}
                  language={state.payload.language}
                />
              </ScrollView>
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 49,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breadcrumb: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center' },
  breadcrumbPart: { minWidth: 0, flexShrink: 1, flexDirection: 'row', alignItems: 'center' },
  breadcrumbMuted: { fontSize: 12, lineHeight: 17 },
  breadcrumbText: { minWidth: 0, flexShrink: 1, paddingHorizontal: 3, fontSize: 12, lineHeight: 18 },
  breadcrumbTitle: { fontWeight: '600' },
  closeButton: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  centerState: { flex: 1, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { fontSize: 13, lineHeight: 19 },
  errorText: { maxWidth: 360, textAlign: 'center', fontSize: 13, lineHeight: 20 },
  content: { minHeight: 0, flex: 1 },
  truncatedBanner: {
    marginHorizontal: 13,
    marginTop: 10,
    marginBottom: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217,119,6,0.34)',
    borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.11)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  truncatedText: { color: '#B56A07', fontSize: 11.5, lineHeight: 16 },
  verticalScroll: { flex: 1 },
  horizontalContent: { minWidth: '100%', paddingVertical: 10 },
});
