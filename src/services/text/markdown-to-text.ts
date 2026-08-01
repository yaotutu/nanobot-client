import { MarkdownIt } from 'react-native-markdown-renderer';

interface MarkdownToken {
  children?: MarkdownToken[] | null;
  content?: string;
  type?: string;
}

const markdownIt = MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: true,
});

function inlineText(tokens: MarkdownToken[] | null | undefined): string {
  if (!tokens?.length) return '';
  return tokens.map((token) => {
    if (token.type === 'softbreak' || token.type === 'hardbreak') return '\n';
    if (token.type === 'image') return token.content ?? '';
    if (token.children?.length) return inlineText(token.children);
    return token.content ?? '';
  }).join('');
}

/**
 * Mirrors the text a browser selection reads from rendered assistant Markdown.
 * Formatting delimiters are removed while visible text, code, and line breaks remain.
 */
export function markdownToSelectableText(value: string): string {
  const tokens = markdownIt.parse(value, {}) as MarkdownToken[];
  let output = '';
  for (const token of tokens) {
    if (token.type === 'inline') {
      output += inlineText(token.children);
      continue;
    }
    if (token.type === 'fence' || token.type === 'code_block') {
      output += token.content ?? '';
      if (!output.endsWith('\n')) output += '\n';
      continue;
    }
    if (
      token.type === 'paragraph_close'
      || token.type === 'heading_close'
      || token.type === 'list_item_close'
      || token.type === 'blockquote_close'
      || token.type === 'tr_close'
    ) {
      if (!output.endsWith('\n')) output += '\n';
    }
  }
  return output
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
