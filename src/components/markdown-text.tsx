import { Image as ExpoImage } from 'expo-image';
import * as Linking from 'expo-linking';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import Markdown, {
  MarkdownIt,
  type ASTNode,
  type MarkdownStyles,
  type RenderRules,
} from 'react-native-markdown-renderer';

import { CodeBlock } from './code-block';
import { FileReferenceChip } from './file-reference-chip';
import {
  fileReferenceFromLink,
  isLikelyFilePath,
  isNonNavigableFilePatternLink,
} from '@/features/chat/file-reference';

interface MarkdownPalette {
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
}

interface MarkdownTextProps {
  children: string;
  colors: MarkdownPalette;
  dark: boolean;
  streaming?: boolean;
  codeWrap?: boolean;
  onOpenFilePreview?: (path: string) => void;
  resolveFilePreviewAvailability?: (path: string) => Promise<boolean>;
}

const markdownIt = MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: true,
});

function safeLink(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('mailto:') ||
    normalized.startsWith('tel:');
}

function astText(node: ASTNode): string {
  if (node.content) return node.content;
  return node.children?.map(astText).join('') ?? '';
}

export function MarkdownText({
  children,
  colors,
  dark,
  streaming = false,
  codeWrap = true,
  onOpenFilePreview,
  resolveFilePreviewAvailability,
}: MarkdownTextProps) {
  const { t } = useTranslation();
  const styles = useMemo<Partial<MarkdownStyles>>(() => ({
    body: { width: '100%', color: colors.foreground },
    text: { color: colors.foreground, fontSize: 15.5, lineHeight: 23.5 },
    paragraph: { marginTop: 0, marginBottom: 11 },
    headingContainer: { marginTop: 8, marginBottom: 8 },
    heading1: { color: colors.foreground, fontSize: 25, lineHeight: 31, fontWeight: '700' },
    heading2: { color: colors.foreground, fontSize: 21, lineHeight: 27, fontWeight: '700' },
    heading3: { color: colors.foreground, fontSize: 18, lineHeight: 24, fontWeight: '700' },
    heading4: { color: colors.foreground, fontSize: 16, lineHeight: 22, fontWeight: '700' },
    heading5: { color: colors.foreground, fontSize: 15, lineHeight: 21, fontWeight: '700' },
    heading6: { color: colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
    strong: { color: colors.foreground, fontWeight: '700' },
    em: { color: colors.foreground, fontStyle: 'italic' },
    strikethrough: { textDecorationLine: 'line-through', color: colors.muted },
    link: { color: dark ? '#8AB4F8' : '#2867B2', textDecorationLine: 'underline' },
    blockquote: {
      borderLeftColor: colors.border,
      borderLeftWidth: 3,
      paddingLeft: 13,
      paddingVertical: 3,
      marginLeft: 0,
      marginBottom: 11,
      backgroundColor: 'transparent',
    },
    codeInline: {
      color: colors.foreground,
      backgroundColor: colors.pressed,
      borderRadius: 5,
      fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13.5,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    list: { width: '100%', marginBottom: 8 },
    listItem: { minWidth: 0, flex: 1, paddingLeft: 3 },
    listUnorderedItem: { flexDirection: 'row', marginBottom: 4 },
    listUnorderedItemIcon: { color: colors.muted, fontSize: 20, lineHeight: 23, marginRight: 7 },
    listOrderedItem: { flexDirection: 'row', marginBottom: 4 },
    listOrderedItemIcon: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 23,
      minWidth: 24,
      marginRight: 5,
      textAlign: 'right',
    },
    table: {
      borderColor: colors.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 9,
      overflow: 'hidden',
      marginBottom: 13,
    },
    tableHeader: { backgroundColor: colors.pressed },
    tableHeaderCell: {
      flex: 1,
      paddingHorizontal: 8,
      paddingVertical: 7,
      borderRightColor: colors.border,
      borderRightWidth: StyleSheet.hairlineWidth,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tableRowCell: {
      flex: 1,
      paddingHorizontal: 8,
      paddingVertical: 7,
      borderRightColor: colors.border,
      borderRightWidth: StyleSheet.hairlineWidth,
    },
    hr: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 15 },
  }), [colors, dark]);

  const rules = useMemo<RenderRules>(() => ({
    code_inline: (node: ASTNode) => {
      const path = node.content.trim();
      if (isLikelyFilePath(path)) {
        return (
          <FileReferenceChip
            colors={colors}
            key={node.key}
            onOpen={onOpenFilePreview}
            path={path}
            resolveAvailability={resolveFilePreviewAvailability}
          />
        );
      }
      return (
        <Text key={node.key} selectable style={styles.codeInline as TextStyle}>{node.content}</Text>
      );
    },
    code_block: (node: ASTNode) => (
      <CodeBlock
        code={node.content}
        colors={colors}
        dark={dark}
        highlight={!streaming}
        key={node.key}
        wrap={codeWrap}
      />
    ),
    fence: (node: ASTNode) => (
      <CodeBlock
        code={node.content}
        colors={colors}
        dark={dark}
        highlight={!streaming}
        key={node.key}
        language={node.sourceInfo}
        wrap={codeWrap}
      />
    ),
    image: (node: ASTNode) => {
      const uri = node.attributes.src?.trim();
      if (!uri || !/^https?:\/\//i.test(uri)) return null;
      return (
        <View key={node.key} style={nativeStyles.imageFrame}>
          <ExpoImage
            accessibilityLabel={node.attributes.alt || t('message.markdownImage', {
              defaultValue: 'Markdown image',
            })}
            contentFit="cover"
            source={{ uri }}
            style={nativeStyles.image}
          />
        </View>
      );
    },
    link: (node: ASTNode, children) => {
      const href = node.attributes.href?.trim();
      const filePath = fileReferenceFromLink(href);
      if (filePath) {
        const label = astText(node).trim();
        return (
          <FileReferenceChip
            colors={colors}
            displayPath={label || filePath}
            key={node.key}
            onOpen={onOpenFilePreview}
            path={filePath}
            previewPath={filePath}
            resolveAvailability={resolveFilePreviewAvailability}
          />
        );
      }
      if (isNonNavigableFilePatternLink(href)) {
        return <Text key={node.key} selectable style={{ color: colors.foreground }}>{children}</Text>;
      }
      return (
        <Text
          key={node.key}
          onPress={() => { if (href && safeLink(href)) void Linking.openURL(href); }}
          selectable
          style={styles.link as TextStyle}
        >
          {children}
        </Text>
      );
    },
    html_block: (node: ASTNode) => (
      <Text key={node.key} selectable style={[nativeStyles.htmlFallback, { color: colors.muted }]}>
        {node.content}
      </Text>
    ),
    html_inline: (node: ASTNode) => (
      <Text key={node.key} selectable style={{ color: colors.muted }}>{node.content}</Text>
    ),
  }), [
    codeWrap,
    colors,
    dark,
    onOpenFilePreview,
    resolveFilePreviewAvailability,
    streaming,
    styles.codeInline,
    styles.link,
    t,
  ]);

  return (
    <Markdown
      allowedImageHandlers={['https://', 'http://']}
      defaultImageHandler={null}
      markdownit={markdownIt}
      onLinkPress={(url) => {
        if (safeLink(url)) void Linking.openURL(url);
        return false;
      }}
      rules={rules}
      style={styles}
    >
      {children}
    </Markdown>
  );
}

const nativeStyles = StyleSheet.create({
  imageFrame: {
    width: '100%',
    maxWidth: 420,
    aspectRatio: 1.6,
    overflow: 'hidden',
    borderRadius: 14,
    marginBottom: 12,
  },
  image: { width: '100%', height: '100%' },
  htmlFallback: {
    fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
