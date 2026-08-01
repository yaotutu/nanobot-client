import { AlertCircle, ChevronRight, X } from 'lucide-react-native';
import { Highlight, themes, type Language } from 'prism-react-renderer';
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
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/services/api';
import { fetchFilePreview } from '@/features/chat/api';
import i18n from '@/i18n';
import type { FilePreviewPayload } from '@/types/api';

interface FilePreviewPalette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
  errorText: string;
}

interface FilePreviewModalProps {
  colors: FilePreviewPalette;
  dark: boolean;
  path: string | null;
  sessionKey: string | null;
  token: string;
  onClose: () => void;
}

type PreviewState =
  | { requestKey: string; status: 'error'; error: unknown }
  | { requestKey: string; status: 'ready'; payload: FilePreviewPayload };

const LANGUAGE_ALIASES: Record<string, Language> = {
  bash: 'bash',
  c: 'c',
  cpp: 'cpp',
  css: 'css',
  diff: 'diff',
  go: 'go',
  graphql: 'graphql',
  html: 'markup',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  kotlin: 'kotlin',
  kt: 'kotlin',
  markdown: 'markdown',
  md: 'markdown',
  markup: 'markup',
  objectivec: 'objectivec',
  objc: 'objectivec',
  php: 'php',
  powershell: 'powershell',
  py: 'python',
  python: 'python',
  ruby: 'ruby',
  rust: 'rust',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  swift: 'swift',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  xml: 'markup',
  yaml: 'yaml',
  yml: 'yaml',
};

function normalizedLanguage(language?: string): Language {
  const first = language?.trim().toLowerCase().split(/\s+/, 1)[0] ?? '';
  return LANGUAGE_ALIASES[first] ?? 'plain';
}

function previewErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404 && /API route not found/i.test(error.message)) {
      return i18n.t('filePreview.routeMissing');
    }
    return error.message;
  }
  return i18n.t('filePreview.failed');
}

function compactBreadcrumb(path: string): { prefix: string | null; parts: string[] } {
  const normalized = path.replace(/\\/g, '/');
  const allParts = normalized.split('/').filter(Boolean);
  const parts = allParts.length > 3 ? allParts.slice(-3) : allParts;
  return {
    prefix: allParts.length > parts.length ? '…' : normalized.startsWith('/') ? '/' : null,
    parts,
  };
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
  const [result, setResult] = useState<PreviewState | null>(null);

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
  const breadcrumb = useMemo(() => compactBreadcrumb(previewPath), [previewPath]);

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

function HighlightedFile({
  code,
  colors,
  dark,
  language,
}: {
  code: string;
  colors: FilePreviewPalette;
  dark: boolean;
  language: string;
}) {
  const cleanCode = code.endsWith('\n') ? code.slice(0, -1) : code;
  return (
    <Highlight
      code={cleanCode}
      language={normalizedLanguage(language)}
      theme={dark ? themes.oneDark : themes.github}
    >
      {({ getTokenProps, tokens }) => (
        <View>
          {tokens.map((line, lineIndex) => (
            <View key={`preview-line-${lineIndex}`} style={styles.codeLine}>
              <Text
                selectable={false}
                style={[styles.lineNumber, { color: colors.subtle, borderRightColor: colors.border }]}
              >
                {lineIndex + 1}
              </Text>
              <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
                {line.map((token, tokenIndex) => {
                  const tokenProps = getTokenProps({ token });
                  return (
                    <Text
                      key={`preview-token-${lineIndex}-${tokenIndex}`}
                      style={tokenProps.style as TextStyle}
                    >
                      {tokenProps.children}
                    </Text>
                  );
                })}
                {line.length === 0 ? ' ' : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Highlight>
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
  codeLine: { minHeight: 20, flexDirection: 'row', alignItems: 'stretch' },
  lineNumber: {
    width: 52,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 2,
    textAlign: 'right',
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  codeText: {
    minWidth: 320,
    paddingLeft: 12,
    paddingRight: 18,
    paddingVertical: 2,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
});
