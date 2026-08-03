import { useCallback, useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { normalizeQuotedContext } from '@/services/text/user-quote-format';

export function useComposerDraft() {
  const [text, setText] = useState('');
  const [quotedContext, setQuotedContext] = useState<string | null>(null);
  const [slashMenuDismissed, setSlashMenuDismissed] = useState(false);
  const [mentionMenuDismissed, setMentionMenuDismissed] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<TextInput>(null);

  const focusAt = useCallback((nextCursor: number) => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps({
        selection: { start: nextCursor, end: nextCursor },
      });
    }, 0);
  }, []);

  const clear = useCallback(() => {
    setText('');
    setQuotedContext(null);
    setSlashMenuDismissed(false);
    setMentionMenuDismissed(false);
    setCursor(0);
  }, []);

  const restore = useCallback((content: string, quote: string | null) => {
    setText(content);
    setQuotedContext(quote);
    setSlashMenuDismissed(false);
    setMentionMenuDismissed(false);
    setCursor(content.length);
    focusAt(content.length);
  }, [focusAt]);

  const appendTranscript = useCallback((transcript: string) => {
    setText((current) => (
      current
        ? `${current}${/\s$/.test(current) ? '' : ' '}${transcript}`
        : transcript
    ));
    inputRef.current?.focus();
  }, []);

  const confirmQuote = useCallback((content: string) => {
    setQuotedContext(normalizeQuotedContext(content));
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  return {
    appendTranscript,
    clear,
    confirmQuote,
    cursor,
    focusAt,
    inputRef,
    mentionMenuDismissed,
    onChangeText(value: string) {
      setText(value);
      setSlashMenuDismissed(false);
      setMentionMenuDismissed(false);
    },
    onCursorChange(nextCursor: number) {
      setCursor(nextCursor);
      setSlashMenuDismissed(false);
      setMentionMenuDismissed(false);
    },
    quotedContext,
    restore,
    setCursor,
    setMentionMenuDismissed,
    setQuotedContext,
    setSlashMenuDismissed,
    setText,
    slashMenuDismissed,
    text,
  };
}
