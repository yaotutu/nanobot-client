import { describe, expect, it } from 'vitest';

import { formatQuotedUserMessage, normalizeQuotedContext, parseQuotedUserMessage } from '@/services/user-quote-format';

describe('formatQuotedUserMessage', () => {
  it('returns original content when no quote', () => {
    expect(formatQuotedUserMessage('hello', null)).toBe('hello');
  });

  it('prepends quoted block with separator', () => {
    const out = formatQuotedUserMessage('reply', 'previous reply');
    expect(out).toContain('reply');
    expect(out).toContain('previous reply');
    expect(out).toContain('>');
  });
});

describe('normalizeQuotedContext', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuotedContext('  hello\n\n  world  ')).toBe('hello\n\n  world'); // trims edges, preserves internal
  });

  it('returns empty for empty/null', () => {
    expect(normalizeQuotedContext(null)).toBe('');
    expect(normalizeQuotedContext('')).toBe('');
    expect(normalizeQuotedContext('   ')).toBe('');
  });
});

describe('parseQuotedUserMessage', () => {
  it('splits content + quoted context from formatted text', () => {
    const formatted = formatQuotedUserMessage('reply', 'previous');
    const out = parseQuotedUserMessage(formatted);
    expect(out.content).toBe('reply');
    expect(out.quotedContext).toBe('previous');
  });

  it('returns empty quoted context for plain text', () => {
    const out = parseQuotedUserMessage('just plain text');
    expect(out.content).toBe('just plain text');
    expect(out.quotedContext).toBe(null);
  });
});
