import { ChevronRight, Folder, MoreHorizontal, Pin, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { SessionGroup } from '@/features/sidebar/chat-groups';
import type { SidebarListItem } from '@/features/sidebar/sidebar-list-model';
import { relativeTime, sessionTitle, visibleSessionPreview } from '@/services/text/format';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';
import { sidebarStyles as styles } from './sidebar-drawer-styles';

interface SidebarListRowProps {
  item: SidebarListItem;
  state: SidebarStatePayload;
  activeKey: string | null;
  onClose: () => void;
  onSelect: (key: string) => void;
  onToggleGroup: (groupId: string) => Promise<void>;
  onNewChatInProject: (projectPath: string, projectName: string) => void;
  onShowSessionActions: (session: ChatSummary) => void;
  onShowProjectActions: (group: SessionGroup) => void;
  onShowMore: (totalCount: number) => void;
}

export function SidebarListRow({
  item,
  state,
  activeKey,
  onClose,
  onSelect,
  onToggleGroup,
  onNewChatInProject,
  onShowSessionActions,
  onShowProjectActions,
  onShowMore,
}: SidebarListRowProps) {
  const { t } = useTranslation();

  if (item.type === 'projects-label') {
    return <Text style={styles.projectsTitle}>{t('chat.groups.projects')}</Text>;
  }
  if (item.type === 'group') {
    if (item.group.kind !== 'project') return <Text style={styles.sectionTitle}>{item.group.label}</Text>;
    const collapsed = Boolean(state.collapsed_groups[item.group.id]);
    return (
      <View style={styles.projectHeader}>
        <Pressable
          accessibilityLabel={`${t('chat.groups.projects')}: ${item.group.label}`}
          accessibilityState={{ expanded: !collapsed }}
          onLongPress={() => onShowProjectActions(item.group)}
          onPress={() => void onToggleGroup(item.group.id)}
          style={({ pressed }) => [styles.projectMain, pressed && styles.rowPressed]}
        >
          <ChevronRight
            color="#87857F"
            size={14}
            style={{ transform: [{ rotate: collapsed ? '0deg' : '90deg' }] }}
          />
          <Folder color="#777570" size={14} strokeWidth={1.7} />
          <Text numberOfLines={1} style={styles.projectName}>{item.group.label}</Text>
          {state.view.show_timestamps && item.group.updatedAt ? (
            <Text style={styles.projectTime}>{relativeTime(item.group.updatedAt)}</Text>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityLabel={`${t('chat.renameProjectTitle')}: ${item.group.label}`}
          hitSlop={5}
          onPress={() => onShowProjectActions(item.group)}
          style={({ pressed }) => [styles.projectAction, pressed && styles.rowPressed]}
        >
          <MoreHorizontal color="#85837E" size={15} />
        </Pressable>
        {item.group.projectPath ? (
          <Pressable
            accessibilityLabel={t('chat.newInProject', { project: item.group.label })}
            hitSlop={5}
            onPress={() => {
              onNewChatInProject(item.group.projectPath ?? '', item.group.label);
              onClose();
            }}
            style={({ pressed }) => [styles.projectAction, pressed && styles.rowPressed]}
          >
            <Plus color="#85837E" size={15} />
          </Pressable>
        ) : null}
      </View>
    );
  }
  if (item.type === 'fold') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => void onToggleGroup(item.groupId)}
        style={({ pressed }) => [styles.foldButton, pressed && styles.rowPressed]}
      >
        <Text style={styles.foldText}>
          {item.folded ? t('chat.collapsed', { count: item.hiddenCount }) : t('chat.showLess')}
        </Text>
      </Pressable>
    );
  }
  if (item.type === 'more') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => onShowMore(item.totalCount)}
        style={({ pressed }) => [styles.showMoreButton, pressed && styles.rowPressed]}
      >
        <Text style={styles.foldText}>{t('chat.showMore', { count: item.hiddenCount })}</Text>
      </Pressable>
    );
  }

  const { group, session } = item;
  const selected = session.key === activeKey;
  const pinned = state.pinned_keys.includes(session.key);
  const title = state.title_overrides[session.key] || sessionTitle(session);
  const preview = visibleSessionPreview(session.preview);
  const projectMode = group.kind === 'project';
  const timestamp = state.view.show_timestamps
    ? relativeTime(session.updatedAt ?? session.createdAt)
    : '';
  return (
    <Pressable
      accessibilityLabel={selected ? `${title} · ${t('connection.open')}` : title}
      accessibilityState={{ selected }}
      onLongPress={() => onShowSessionActions(session)}
      onPress={() => {
        onSelect(session.key);
        onClose();
      }}
      style={({ pressed }) => [
        styles.sessionRow,
        projectMode && styles.projectSessionRow,
        selected && styles.sessionRowSelected,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.sessionCopy}>
        <View style={styles.sessionTitleRow}>
          <Text numberOfLines={1} style={styles.sessionTitle}>{title}</Text>
          {pinned ? <Pin color="#8A8984" size={12} strokeWidth={1.8} /> : null}
          {projectMode && timestamp ? <Text style={styles.time}>{timestamp}</Text> : null}
        </View>
        {state.view.show_previews && preview && preview !== title ? (
          <Text numberOfLines={1} style={styles.preview}>{preview}</Text>
        ) : null}
        {!projectMode && timestamp ? <Text style={styles.time}>{timestamp}</Text> : null}
      </View>
      <Pressable
        accessibilityLabel={t('chat.actions', { title })}
        hitSlop={7}
        onPress={() => onShowSessionActions(session)}
        style={({ pressed }) => [styles.moreButton, pressed && styles.rowPressed]}
      >
        <MoreHorizontal color="#85837E" size={16} />
      </Pressable>
    </Pressable>
  );
}
