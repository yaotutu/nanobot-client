import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDashed,
  ExternalLink,
  FilePenLine,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useResolvedFilePreviewAvailability } from '@/features/chat/hooks/use-resolved-file-preview-availability';
import { countDiffLines, parseRenderableFileDiff } from '@/services/text/file-diff';
import { compactActivityPath, redactActivityText, safeActivityDetail } from '@/services/text/log-redaction';
import type { FileEditDisplayMode } from '@/stores/local-preferences-store';
import type { Palette } from '@/ui/palette';

import {
  type FileEditSummary,
  diffKindColor,
  selectVisibleDiffLines,
} from '@/features/chat/activity/model/tool-helpers';
import { fileEditStyles as styles } from './file-edit-styles';

const INITIAL_VISIBLE_DIFF_LINES = 160;

export function FileEditRow({
  colors,
  edit,
  displayMode,
  onOpenFilePreview,
  resolveFilePreviewAvailability,
}: {
  colors: Palette;
  edit: FileEditSummary;
  displayMode: FileEditDisplayMode;
  onOpenFilePreview?: (path: string) => void;
  resolveFilePreviewAvailability?: (path: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [expandedLines, setExpandedLines] = useState(false);
  const failed = edit.status === 'error';
  const running = edit.status === 'editing';
  const deleting = edit.operation === 'delete';
  const action = failed
    ? deleting
      ? t('message.fileDeleteFailed', { defaultValue: 'Delete failed' })
      : t('message.fileEditFailed', { defaultValue: 'Edit failed' })
    : running
      ? deleting
        ? t('message.fileDeleting', { defaultValue: 'Deleting' })
        : t('message.fileEditing', { defaultValue: 'Editing' })
      : deleting
        ? t('message.fileDeleted', { defaultValue: 'Deleted' })
        : t('message.fileEdited', { defaultValue: 'Edited' });
  const path = compactActivityPath(redactActivityText(edit.path || edit.absolutePath || t('message.file', { defaultValue: 'File' })));
  const previewPath = edit.absolutePath || edit.path;
  const previewAvailable = useResolvedFilePreviewAvailability(
    previewPath,
    onOpenFilePreview,
    resolveFilePreviewAvailability,
  );
  const renderableDiff = useMemo(
    () => edit.diff ? parseRenderableFileDiff(edit.diff) : { hunks: [] },
    [edit.diff],
  );
  const totalLineCount = countDiffLines(renderableDiff);
  const canRenderDiff = displayMode !== 'summary' && !running && !failed && totalLineCount > 0;
  const shouldAutoCollapse = totalLineCount > INITIAL_VISIBLE_DIFF_LINES || Boolean(edit.diff?.truncated);
  const startsCollapsed = displayMode === 'collapsed_diff' || shouldAutoCollapse;
  const shouldRenderBody = canRenderDiff && (!startsCollapsed || open);
  const lineLimit = expandedLines ? totalLineCount : Math.min(totalLineCount, INITIAL_VISIBLE_DIFF_LINES);
  const visibleDiff = useMemo(
    () => selectVisibleDiffLines(renderableDiff, lineLimit),
    [lineLimit, renderableDiff],
  );
  const hiddenLineCount = Math.max(0, totalLineCount - lineLimit);
  const showStats = !failed && !edit.binary && (edit.added > 0 || edit.deleted > 0);

  return (
    <View style={[styles.fileCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.fileHeader}>
        <View style={styles.fileStatusIcon}>
          {running ? (
            <CircleDashed color={colors.subtle} size={15} strokeWidth={1.8} />
          ) : failed ? (
            <AlertCircle color={colors.errorText} size={15} strokeWidth={1.9} />
          ) : (
            <FilePenLine color="#2F8F61" size={15} strokeWidth={1.9} />
          )}
        </View>
        <View style={styles.fileTitleArea}>
          <Text style={[styles.fileAction, { color: failed ? colors.errorText : colors.muted }]}>
            {edit.pending && !edit.path
              ? t('message.fileEditPreparing', { defaultValue: 'Preparing file edit…' })
              : action}
          </Text>
          {path ? (
            <Pressable
              accessibilityHint={previewAvailable ? t('message.openFilePreview', { defaultValue: 'Open file preview' }) : undefined}
              accessibilityRole={previewAvailable ? 'button' : undefined}
              disabled={!previewAvailable}
              onPress={() => previewPath && onOpenFilePreview?.(previewPath)}
            >
              <Text
                numberOfLines={1}
                selectable
                style={[styles.filePath, { color: previewAvailable ? colors.foreground : colors.muted }]}
              >
                {path}
              </Text>
            </Pressable>
          ) : null}
          {failed && edit.error ? (
            <Text numberOfLines={2} style={[styles.fileError, { color: colors.errorText }]}>
              {safeActivityDetail(String(edit.error), 150)}
            </Text>
          ) : null}
        </View>
        {showStats ? (
          <View style={styles.diffPair}>
            <Text style={styles.added}>+{Math.max(0, Math.round(edit.added || 0))}</Text>
            <Text style={styles.deleted}>-{Math.max(0, Math.round(edit.deleted || 0))}</Text>
          </View>
        ) : null}
      </View>

      {canRenderDiff && startsCollapsed ? (
        <Pressable
          accessibilityLabel={open
            ? t('message.collapseDiff', { defaultValue: 'Collapse diff' })
            : t('message.viewDiff', { defaultValue: 'View diff' })}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => {
            if (open) setExpandedLines(false);
            setOpen((value) => !value);
          }}
          style={({ pressed }) => [
            styles.diffToggle,
            { borderTopColor: colors.border, backgroundColor: colors.pressed },
            pressed && { opacity: 0.72 },
          ]}
        >
          <ChevronRight
            color={colors.subtle}
            size={13}
            style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
          />
          <Text style={[styles.diffToggleLabel, { color: colors.muted }]}>
            {shouldAutoCollapse
              ? t('message.viewLargeDiff', { defaultValue: 'View large diff' })
              : t('message.viewDiff', { defaultValue: 'View diff' })}
          </Text>
          <Text style={[styles.diffToggleCount, { color: colors.subtle }]}>
            {t('message.diffLines', {
              count: `${totalLineCount}${edit.diff?.truncated ? '+' : ''}`,
              defaultValue: '{{count}} lines',
            })}
          </Text>
        </Pressable>
        ) : null}

      {shouldRenderBody ? (
        <View style={[styles.diffPanel, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
            <View style={styles.diffTable}>
              {visibleDiff.map(({ hunk, skippedBefore }, hunkIndex) => (
                <View
                  key={`${hunk.oldStart}:${hunk.newStart}:${hunkIndex}`}
                  style={hunkIndex > 0 ? [styles.diffHunk, { borderTopColor: colors.border }] : undefined}
                >
                  {skippedBefore > 0 ? (
                    <View style={[styles.diffGap, { backgroundColor: colors.pressed }]}>
                      <Text style={[styles.diffGapBadge, { color: colors.subtle, borderColor: colors.border }]}>…</Text>
                      <Text style={[styles.diffGapText, { color: colors.subtle }]}>
                        {t('message.diffUnchangedHidden', {
                          count: skippedBefore,
                          defaultValue: '{{count}} unchanged lines hidden',
                        })}
                      </Text>
                    </View>
                  ) : null}
                  {hunk.lines.map((line, lineIndex) => (
                    <View
                      key={`${hunkIndex}:${lineIndex}:${line.oldLineNumber}:${line.newLineNumber}`}
                      style={[
                        styles.diffRow,
                        line.kind === 'add' && styles.diffAdded,
                        line.kind === 'delete' && styles.diffDeleted,
                      ]}
                    >
                      <Text style={[styles.diffLineNumber, { color: colors.subtle, borderRightColor: colors.border }]}>
                        {line.oldLineNumber ?? ''}
                      </Text>
                      <Text style={[styles.diffLineNumber, { color: colors.subtle, borderRightColor: colors.border }]}>
                        {line.newLineNumber ?? ''}
                      </Text>
                      <Text style={[styles.diffMarker, { color: diffKindColor(line.kind, colors) }]}>
                        {line.kind === 'add' ? '+' : line.kind === 'delete' ? '-' : ' '}
                      </Text>
                      <Text selectable style={[styles.diffCode, { color: colors.foreground }]}>
                        {line.content || ' '}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          {hiddenLineCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpandedLines(true)}
              style={({ pressed }) => [styles.diffMoreButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <ChevronDown color={colors.subtle} size={13} />
              <Text style={[styles.moreLines, { color: colors.subtle }]}>
                {t('message.diffShowMoreLines', { count: hiddenLineCount, defaultValue: 'Show {{count}} more lines' })}
              </Text>
            </Pressable>
          ) : expandedLines && totalLineCount > INITIAL_VISIBLE_DIFF_LINES ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpandedLines(false)}
              style={({ pressed }) => [styles.diffMoreButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <ChevronUp color={colors.subtle} size={13} />
              <Text style={[styles.moreLines, { color: colors.subtle }]}>{t('message.diffShowLess', { defaultValue: 'Show fewer lines' })}</Text>
            </Pressable>
          ) : null}
          {edit.diff?.truncated ? (
            <View style={[styles.diffTruncated, { borderTopColor: colors.border, backgroundColor: colors.pressed }]}>
              <Text style={[styles.diffTruncatedText, { color: colors.subtle }]}>
                {t('message.diffTruncated', { defaultValue: 'Diff truncated. Open the file to view the full content.' })}
              </Text>
              {previewPath && onOpenFilePreview && previewAvailable ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpenFilePreview(previewPath)}
                  style={styles.openFileButton}
                >
                  <ExternalLink color={colors.muted} size={12} />
                  <Text style={[styles.openFileText, { color: colors.muted }]}>{t('message.openFile', { defaultValue: 'Open file' })}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
