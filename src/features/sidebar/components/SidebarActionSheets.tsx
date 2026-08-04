import Archive from 'lucide-react-native/icons/archive';
import ArchiveRestore from 'lucide-react-native/icons/archive-restore';
import Pencil from 'lucide-react-native/icons/pencil';
import Pin from 'lucide-react-native/icons/pin';
import PinOff from 'lucide-react-native/icons/pin-off';
import Search from 'lucide-react-native/icons/search';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { SessionGroup } from '@/features/sidebar/chat-groups';
import type { RenameTarget } from '@/features/sidebar/hooks/use-sidebar-actions';
import { sessionTitle } from '@/services/text/format';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';
import { sidebarStyles as styles } from './sidebar-drawer-styles';

type IconComponent = typeof Search;

export function SidebarActionSheets(props: {
  bottomInset: number;
  state: SidebarStatePayload;
  actionSession: ChatSummary | null;
  actionProject: SessionGroup | null;
  renameTarget: RenameTarget | null;
  renameValue: string;
  onSetActionSession: (session: ChatSummary | null) => void;
  onSetActionProject: (project: SessionGroup | null) => void;
  onSetRenameTarget: (target: RenameTarget | null) => void;
  onSetRenameValue: (value: string) => void;
  onTogglePinned: (key: string) => Promise<void>;
  onToggleArchived: (key: string) => Promise<void>;
  onBeginSessionRename: (session: ChatSummary) => void;
  onBeginProjectRename: (group: SessionGroup) => void;
  onSubmitRename: () => void;
  onRequestDelete: (session: ChatSummary) => Promise<void>;
}) {
  const { t } = useTranslation();
  const {
    bottomInset,
    state,
    actionSession,
    actionProject,
    renameTarget,
    renameValue,
    onSetActionSession,
    onSetActionProject,
    onSetRenameTarget,
    onSetRenameValue,
    onTogglePinned,
    onToggleArchived,
    onBeginSessionRename,
    onBeginProjectRename,
    onSubmitRename,
    onRequestDelete,
  } = props;

  return (
    <>
      {actionSession ? (
        <View style={styles.actionOverlay}>
          <Pressable accessibilityLabel={t('deleteConfirm.cancel')} onPress={() => onSetActionSession(null)} style={styles.actionBackdrop} />
          <View style={[styles.actionSheet, { paddingBottom: Math.max(bottomInset, 12) }]}>
            <Text numberOfLines={1} style={styles.actionTitle}>
              {state.title_overrides[actionSession.key] || sessionTitle(actionSession)}
            </Text>
            <SheetAction
              icon={state.pinned_keys.includes(actionSession.key) ? PinOff : Pin}
              label={state.pinned_keys.includes(actionSession.key) ? t('chat.unpin') : t('chat.pin')}
              onPress={() => {
                const key = actionSession.key;
                onSetActionSession(null);
                void onTogglePinned(key);
              }}
            />
            <SheetAction icon={Pencil} label={t('chat.rename')} onPress={() => onBeginSessionRename(actionSession)} />
            <SheetAction
              icon={state.archived_keys.includes(actionSession.key) ? ArchiveRestore : Archive}
              label={state.archived_keys.includes(actionSession.key) ? t('chat.unarchive') : t('chat.archive')}
              onPress={() => {
                const key = actionSession.key;
                onSetActionSession(null);
                void onToggleArchived(key);
              }}
            />
            <SheetAction destructive icon={Trash2} label={t('chat.delete')} onPress={() => void onRequestDelete(actionSession)} />
          </View>
        </View>
      ) : null}

      {actionProject ? (
        <View style={styles.actionOverlay}>
          <Pressable accessibilityLabel={t('deleteConfirm.cancel')} onPress={() => onSetActionProject(null)} style={styles.actionBackdrop} />
          <View style={[styles.actionSheet, { paddingBottom: Math.max(bottomInset, 12) }]}>
            <Text numberOfLines={1} style={styles.actionTitle}>{actionProject.label}</Text>
            <SheetAction icon={Pencil} label={t('chat.renameProjectTitle')} onPress={() => onBeginProjectRename(actionProject)} />
          </View>
        </View>
      ) : null}

      {renameTarget ? (
        <View style={styles.renameOverlay}>
          <Pressable accessibilityLabel={t('deleteConfirm.cancel')} onPress={() => onSetRenameTarget(null)} style={styles.actionBackdrop} />
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>
              {renameTarget.kind === 'project' ? t('chat.renameProjectTitle') : t('chat.renameTitle')}
            </Text>
            <TextInput
              accessibilityLabel={renameTarget.kind === 'project' ? t('chat.renameProjectTitle') : t('chat.renameTitle')}
              autoFocus
              maxLength={120}
              onChangeText={onSetRenameValue}
              onSubmitEditing={onSubmitRename}
              returnKeyType="done"
              selectTextOnFocus
              style={styles.renameInput}
              value={renameValue}
            />
            <View style={styles.renameActions}>
              <Pressable onPress={() => onSetRenameTarget(null)} style={styles.renameButton}>
                <Text style={styles.renameCancelText}>{t('deleteConfirm.cancel')}</Text>
              </Pressable>
              <Pressable onPress={onSubmitRename} style={[styles.renameButton, styles.renamePrimary]}>
                <Text style={styles.renamePrimaryText}>{t('chat.renameSave')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}

function SheetAction({
  destructive = false,
  icon: Icon,
  label,
  onPress,
}: {
  destructive?: boolean;
  icon: IconComponent;
  label: string;
  onPress: () => void;
}) {
  const color = destructive ? '#B7443B' : '#44433F';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.sheetAction, pressed && styles.rowPressed]}>
      <Icon color={color} size={18} strokeWidth={1.8} />
      <Text style={[styles.sheetActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}
