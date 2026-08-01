import { describe, expect, it } from 'vitest';

import { compactActivityPath, redactActivityText, redactShellCommand } from '@/services/log-redaction';

describe('redactActivityText', () => {
  it('redacts bearer tokens', () => {
    expect(redactActivityText('Authorization: Bearer abc123def456ghi789')).not.toContain('abc123def456ghi789');
  });

  it('redacts API key=value patterns', () => {
    expect(redactActivityText('API_KEY=sk-12345abcde')).toContain('<redacted>');
  });

  it('redacts query string api_key', () => {
    expect(redactActivityText('https://example.com?api_key=secret')).toContain('<redacted>');
  });

  it('redacts common prefixes (sk-, xoxb-)', () => {
    expect(redactActivityText('sk-abc123def456ghi789')).toBe('<redacted>');
    expect(redactActivityText('xoxb-1234567890-abcd')).toBe('<redacted>');
  });

  it('leaves plain text intact', () => {
    expect(redactActivityText('hello world')).toBe('hello world');
  });
});

describe('redactShellCommand', () => {
  it('replaces redacted placeholders with bullets', () => {
    expect(redactShellCommand('curl -H "Authorization: Bearer xyz"')).toContain('••••');
    expect(redactShellCommand('curl -H "Authorization: Bearer xyz"')).not.toContain('<redacted>');
  });
});

describe('compactActivityPath', () => {
  it('replaces user home paths with ~', () => {
    expect(compactActivityPath('/Users/johndoe/foo')).toBe('~/foo');
  });

  it('replaces home paths', () => {
    expect(compactActivityPath('/home/somebody/bar')).toBe('~/bar');
  });
});
