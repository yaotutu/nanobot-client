import { Image as ExpoImage } from 'expo-image';
import * as Linking from 'expo-linking';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type TextStyle, type StyleProp, type ViewStyle } from 'react-native';
import Markdown, {
  MarkdownIt,
  type ASTNode,
  type MarkdownStyles,
  type RenderRules,
} from 'react-native-markdown-renderer';

import { CodeBlock } from '@/ui/components/CodeBlock';
import { FileReferenceChip } from './file-reference-chip';
import {
  fileReferenceFromLink,
  isLikelyFilePath,
  isNonNavigableFilePatternLink,
} from '@/features/chat/model/file-reference';

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
  onOpenFilePreview,
  resolveFilePreviewAvailability,
}: MarkdownTextProps) {
  const { t } = useTranslation();
  const styles = useMemo<Partial<MarkdownStyles>>(() => ({
    body: { width: '100%', color: colors.foreground },
    // 仅对齐参考 UI 的正文与紧凑标题比例，不改变 Markdown 解析、文件链接或媒体规则。
    // 段落/列表间隔为 6px，标题上下为 8/4px，避免短回复被大号标题和留白撑开。
    text: { color: colors.foreground, fontSize: 16, lineHeight: 24 },
    paragraph: { marginTop: 0, marginBottom: 6 },
    headingContainer: { marginTop: 8, marginBottom: 4 },
    heading1Container: { paddingBottom: 0, borderBottomWidth: 0 },
    heading2Container: { paddingBottom: 0, borderBottomWidth: 0 },
    heading1: { color: colors.foreground, fontSize: 21, lineHeight: 27, fontWeight: '600' },
    heading2: { color: colors.foreground, fontSize: 19, lineHeight: 25, fontWeight: '600' },
    heading3: { color: colors.foreground, fontSize: 17, lineHeight: 23, fontWeight: '600' },
    heading4: { color: colors.foreground, fontSize: 16, lineHeight: 24, fontWeight: '600' },
    heading5: { color: colors.foreground, fontSize: 16, lineHeight: 24, fontWeight: '600' },
    heading6: { color: colors.muted, fontSize: 16, lineHeight: 24, fontWeight: '600' },
    strong: { color: colors.foreground, fontWeight: '600' },
    em: { color: colors.foreground, fontStyle: 'italic' },
    strikethrough: { textDecorationLine: 'line-through', color: colors.muted },
    link: { color: dark ? '#8AB4F8' : '#2867B2', textDecorationLine: 'underline' },
    // 仅给内容块添加柔和表面，浅暗主题均沿用 Palette，不设置消息外层背景。
    blockquote: {
      borderLeftColor: colors.border,
      borderLeftWidth: 2,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 0,
      marginLeft: 0,
      marginTop: 4,
      marginBottom: 12,
      backgroundColor: colors.pressed,
    },
    codeInline: {
      color: colors.foreground,
      backgroundColor: colors.pressed,
      borderRadius: 6,
      fontFamily: 'monospace',
      fontSize: 14,
      lineHeight: 24,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    list: { width: '100%', marginBottom: 6 },
    listItem: { minWidth: 0, flex: 1, paddingLeft: 4 },
    listUnorderedItem: { flexDirection: 'row', marginTop: 0, marginBottom: 6 },
    listUnorderedItemIcon: { color: colors.muted, fontSize: 20, lineHeight: 24, marginRight: 8 },
    listOrderedItem: { flexDirection: 'row', marginTop: 0, marginBottom: 6 },
    listOrderedItemIcon: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 24,
      minWidth: 24,
      marginRight: 8,
      textAlign: 'right',
    },
    table: {
      borderColor: colors.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.card,
      marginTop: 4,
      marginBottom: 12,
    },
    tableHeader: { backgroundColor: colors.pressed },
    tableHeaderCell: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      // 覆盖渲染器默认的四边框，避免硬编码浅色边线在暗色主题中透出。
      borderWidth: 0,
      borderColor: colors.border,
      borderRightColor: colors.border,
      borderRightWidth: StyleSheet.hairlineWidth,
    },
    tableRow: {
      flexDirection: 'row',
      borderColor: colors.border,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tableRowCell: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      // 覆盖渲染器默认的四边框，避免硬编码浅色边线在暗色主题中透出。
      borderWidth: 0,
      borderColor: colors.border,
      borderRightColor: colors.border,
      borderRightWidth: StyleSheet.hairlineWidth,
    },
    hr: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 16 },
  }), [colors, dark]);

  const rules = useMemo<RenderRules>(() => ({
    // 列表行自身负责间距，取消其段落的额外底边距，避免简单列表被拉成大块空白。
    paragraph: (node, children, parent, ruleStyles) => (
      <View key={node.key} style={[ruleStyles.paragraph as StyleProp<ViewStyle>, parent.some((ancestor) => ancestor.type === 'list_item') && { marginBottom: 0 }]}>
        {children}
      </View>
    ),
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
    // 块级代码保留共享组件的圆角、内边距及复制/换行交互，不另加外层容器。
    code_block: (node: ASTNode) => (
      <CodeBlock
        code={node.content}
        colors={colors}
        dark={dark}
        highlight={!streaming}
        key={node.key}
        wrap
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
        wrap
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
    borderRadius: 16,
    marginBottom: 12,
  },
  image: { width: '100%', height: '100%' },
  htmlFallback: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
