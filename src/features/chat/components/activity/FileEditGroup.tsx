import { View } from 'react-native';

import type { Palette } from '@/ui/palette';

import { FileEditRow } from './FileEditRow';
import { fileEditStyles as styles } from './file-edit-styles';
import { type FileEditSummary, fileDiffRevision } from '@/features/chat/activity/model/tool-helpers';

export function FileEditGroup({
  colors,
  edits,
  onOpenFilePreview,
  resolveFilePreviewAvailability,
}: {
  colors: Palette;
  edits: FileEditSummary[];
  onOpenFilePreview?: (path: string) => void;
  resolveFilePreviewAvailability?: (path: string) => Promise<boolean>;
}) {
  return (
    <View style={styles.fileGroup}>
      {edits.map((edit) => (
        <FileEditRow
          colors={colors}
          edit={edit}
          key={`${edit.key}:${fileDiffRevision(edit.diff)}`}
          onOpenFilePreview={onOpenFilePreview}
          resolveFilePreviewAvailability={resolveFilePreviewAvailability}
        />
      ))}
    </View>
  );
}
