import FileCode2 from 'lucide-react-native/icons/file-code-corner';
import FileText from 'lucide-react-native/icons/file-text';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { fileKindForPath, splitFilePath } from '@/features/chat/model/file-reference';

interface FileReferencePalette {
  muted: string;
  subtle: string;
  pressed: string;
}

interface FileReferenceChipProps {
  colors: FileReferencePalette;
  path: string;
  displayPath?: string;
  previewPath?: string;
  onOpen?: (path: string) => void;
  resolveAvailability?: (path: string) => Promise<boolean>;
}

const KIND_COLORS = {
  python: '#3776AB',
  react: '#149ECA',
  javascript: '#B28A00',
  typescript: '#3178C6',
  html: '#E34F26',
  css: '#7B61FF',
  json: '#6F6E69',
  markdown: '#3B82F6',
  notebook: '#F37626',
  default: '#6F6E69',
} as const;

export function FileReferenceChip({
  colors,
  path,
  displayPath,
  previewPath,
  onOpen,
  resolveAvailability,
}: FileReferenceChipProps) {
  const targetPath = previewPath || path;
  const visiblePath = displayPath || path;
  const { directory, name } = splitFilePath(visiblePath);
  const kind = fileKindForPath(targetPath);
  const [availability, setAvailability] = useState<{
    path: string;
    available: boolean;
  } | null>(null);
  const available = Boolean(onOpen) && (
    !resolveAvailability
    || (availability?.path === targetPath && availability.available)
  );

  useEffect(() => {
    if (!onOpen || !resolveAvailability) return;
    let cancelled = false;
    resolveAvailability(targetPath)
      .then((result) => {
        if (!cancelled) setAvailability({ path: targetPath, available: result });
      })
      .catch(() => {
        if (!cancelled) setAvailability({ path: targetPath, available: false });
      });
    return () => { cancelled = true; };
  }, [onOpen, resolveAvailability, targetPath]);

  const Icon = kind === 'default' || kind === 'markdown' ? FileText : FileCode2;
  return (
    <Pressable
      accessibilityLabel={targetPath}
      accessibilityRole={available ? 'button' : undefined}
      disabled={!available}
      onPress={() => onOpen?.(targetPath)}
      style={({ pressed }) => [
        styles.root,
        pressed && { backgroundColor: colors.pressed },
      ]}
    >
      <Icon color={KIND_COLORS[kind]} size={14} strokeWidth={1.9} />
      <Text numberOfLines={1} style={styles.pathText}>
        {directory ? <Text style={{ color: colors.subtle }}>{directory}</Text> : null}
        <Text style={[styles.nameText, { color: available ? '#2583C5' : colors.muted }]}>{name}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    minWidth: 0,
    maxWidth: '100%',
    minHeight: 24,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  pathText: {
    minWidth: 0,
    flexShrink: 1,
    fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13.5,
    lineHeight: 20,
  },
  nameText: { fontWeight: '600' },
});
