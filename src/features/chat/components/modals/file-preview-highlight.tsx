/**
 * 文件预览中的代码高亮视图。
 *
 * 语言别名归一化和逐行渲染集中在这里，使 modal 只负责请求与布局。未知语言回退为 plain，
 * 仍保留等宽字体、行号和可选择文本，不因后端返回新语言标识而导致预览失败。
 */
import { Highlight, themes, type Language } from 'prism-react-renderer';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import type { FilePreviewPalette } from './file-preview-model';

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

export function HighlightedFile({
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
