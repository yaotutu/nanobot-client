import * as Clipboard from 'expo-clipboard';
import Check from 'lucide-react-native/icons/check';
import Copy from 'lucide-react-native/icons/copy';
import { Highlight, themes, type Language } from 'prism-react-renderer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';

interface CodeBlockPalette {
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
}

interface CodeBlockProps {
  code: string;
  colors: CodeBlockPalette;
  dark: boolean;
  highlight?: boolean;
  language?: string;
  wrap?: boolean;
}

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

function languageLabel(language?: string): string {
  const first = language?.trim().split(/\s+/, 1)[0];
  return first || 'text';
}

export function CodeBlock({
  code,
  colors,
  dark,
  highlight = true,
  language,
  wrap = true,
}: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanCode = code.endsWith('\n') ? code.slice(0, -1) : code;

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(cleanCode);
    setCopied(true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1_500);
  }, [cleanCode]);

  const codeBody = highlight ? (
    <Highlight
      code={cleanCode}
      language={normalizedLanguage(language)}
      theme={dark ? themes.oneDark : themes.github}
    >
      {({ getTokenProps, tokens }) => (
        <Text selectable style={[styles.code, { color: colors.foreground }, !wrap && styles.noWrap]}>
          {tokens.map((line, lineIndex) => (
            <Text key={`line-${lineIndex}`}>
              {line.map((token, tokenIndex) => {
                const tokenProps = getTokenProps({ token });
                return (
                  <Text
                    key={`token-${lineIndex}-${tokenIndex}`}
                    style={tokenProps.style as TextStyle}
                  >
                    {tokenProps.children}
                  </Text>
                );
              })}
              {lineIndex < tokens.length - 1 ? '\n' : ''}
            </Text>
          ))}
        </Text>
      )}
    </Highlight>
  ) : (
    <Text selectable style={[styles.code, { color: colors.foreground }, !wrap && styles.noWrap]}>{cleanCode}</Text>
  );

  return (
    <View
      accessibilityLabel={t('code.blockAria', {
        defaultValue: '{{language}} code block',
        language: languageLabel(language),
      })}
      style={[styles.container, { backgroundColor: colors.pressed, borderColor: colors.border }]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text numberOfLines={1} style={[styles.language, { color: colors.subtle }]}>
          {languageLabel(language)}
        </Text>
        <Pressable
          accessibilityLabel={copied ? t('code.copied') : t('code.copyAria')}
          hitSlop={7}
          onPress={() => void copy()}
          style={({ pressed }) => [
            styles.copyButton,
            pressed && { backgroundColor: colors.card },
          ]}
        >
          {copied
            ? <Check color={colors.muted} size={15} strokeWidth={2} />
            : <Copy color={colors.muted} size={15} strokeWidth={1.8} />}
        </Pressable>
      </View>
      {wrap ? (
        <View style={styles.codeViewport}>{codeBody}</View>
      ) : (
        <ScrollView contentContainerStyle={styles.codeViewport} horizontal showsHorizontalScrollIndicator>
          {codeBody}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    marginTop: 5,
    marginBottom: 13,
  },
  header: {
    minHeight: 38,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 15,
    paddingRight: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  language: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'lowercase',
  },
  copyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeViewport: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  noWrap: { minWidth: '100%' },
  code: {
    fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12.5,
    lineHeight: 20,
  },
});
