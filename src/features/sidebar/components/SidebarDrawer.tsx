import { Image } from 'expo-image';
import Archive from 'lucide-react-native/icons/archive';
import ArchiveRestore from 'lucide-react-native/icons/archive-restore';
import Blocks from 'lucide-react-native/icons/blocks';
import Brain from 'lucide-react-native/icons/brain';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import SquarePen from 'lucide-react-native/icons/square-pen';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatGroupLabels } from '@/features/sidebar/chat-groups';
import { useSidebarActions } from '@/features/sidebar/hooks/use-sidebar-actions';
import { useSidebarListModel } from '@/features/sidebar/hooks/use-sidebar-list-model';
import type { SessionAutomationJob } from '@/types/api/automations';
import type { SessionDeleteResult } from '@/types/api/chat/thread';
import type { ConnectionStatus } from '@/types/api/runtime';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';
import { SidebarActionSheets } from './SidebarActionSheets';
import { SidebarListRow } from './SidebarListRow';
import { sidebarStyles as styles } from './sidebar-drawer-styles';

// Static Metro asset; require is the React Native asset loader.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nanobotIcon = require('../../../../assets/images/nanobot-icon.png');

interface SidebarDrawerProps {
  visible: boolean;
  sessions: ChatSummary[];
  state: SidebarStatePayload;
  activeKey: string | null;
  loading: boolean;
  connectionStatus: ConnectionStatus;
  networkAvailable: boolean;
  defaultWorkspacePath?: string | null;
  activeUtility: 'apps' | 'skills' | 'automations' | 'settings' | null;
  onClose: () => void;
  onOpenSearch: () => void;
  onOpenApps: () => void;
  onOpenSkills: () => void;
  onOpenAutomations: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onReconnect: () => Promise<void>;
  onNewChatInProject: (projectPath: string, projectName: string) => void;
  onSelect: (key: string) => void;
  onTogglePinned: (key: string) => Promise<void>;
  onToggleArchived: (key: string) => Promise<void>;
  onToggleGroup: (groupId: string) => Promise<void>;
  onRename: (key: string, title: string) => Promise<void>;
  onRenameProject: (projectKey: string, title: string) => Promise<void>;
  onSetShowArchived: (show: boolean) => Promise<void>;
  onDelete: (key: string, options?: { deleteAutomations?: boolean }) => Promise<SessionDeleteResult>;
  onGetSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
  onLogout: () => void;
}

export function SidebarDrawer(props: SidebarDrawerProps) {
  const {
    visible,
    sessions,
    state,
    activeKey,
    loading,
    connectionStatus,
    networkAvailable,
    defaultWorkspacePath,
    activeUtility,
    onClose,
    onOpenSearch,
    onOpenApps,
    onOpenSkills,
    onOpenAutomations,
    onOpenSettings,
    onNewChat,
    onReconnect,
    onNewChatInProject,
    onSelect,
    onTogglePinned,
    onToggleArchived,
    onToggleGroup,
    onRename,
    onRenameProject,
    onSetShowArchived,
    onDelete,
    onGetSessionAutomations,
    onLogout,
  } = props;
  const insets = useSafeAreaInsets();
  const { i18n, t } = useTranslation();
  const { width } = useWindowDimensions();
  const groupLabels = useMemo<ChatGroupLabels>(() => ({
    pinned: t('chat.groups.pinned'),
    all: t('chat.groups.all'),
    today: t('chat.groups.today'),
    yesterday: t('chat.groups.yesterday'),
    earlier: t('chat.groups.earlier'),
    archived: t('chat.groups.archived'),
  }), [t]);
  const listModel = useSidebarListModel({
    sessions,
    state,
    activeKey,
    defaultWorkspacePath,
    labels: groupLabels,
  });
  const actions = useSidebarActions({
    state,
    t,
    locale: i18n.resolvedLanguage ?? i18n.language,
    onRename,
    onRenameProject,
    onDelete,
    onGetSessionAutomations,
  });

  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel={t('sidebar.collapse')} onPress={onClose} style={styles.backdrop} />
        <View
          accessibilityViewIsModal
          style={[
            styles.drawer,
            {
              width: Math.min(width * 0.88, 360),
              paddingTop: insets.top + 10,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <View style={styles.brandRow}>
            <Image source={nanobotIcon} style={styles.logo} />
          </View>

          <View style={styles.actions}>
            <SidebarAction icon={SquarePen} label={t('sidebar.newChat')} onPress={() => { onNewChat(); onClose(); }} />
            <SidebarAction icon={Search} label={t('sidebar.searchAria')} onPress={onOpenSearch} />
            <SidebarAction active={activeUtility === 'apps'} icon={Blocks} label={t('sidebar.apps')} onPress={onOpenApps} />
            <SidebarAction active={activeUtility === 'skills'} icon={Brain} label={t('sidebar.skills.title')} onPress={onOpenSkills} />
            <SidebarAction
              active={activeUtility === 'automations'}
              icon={CalendarClock}
              label={t('sidebar.automations')}
              onPress={onOpenAutomations}
            />
            {state.archived_keys.length > 0 ? (
              <SidebarAction
                icon={state.view.show_archived ? ArchiveRestore : Archive}
                label={state.view.show_archived ? t('chat.hideArchived') : `${t('chat.groups.archived')} (${state.archived_keys.length})`}
                onPress={() => void onSetShowArchived(!state.view.show_archived)}
              />
            ) : null}
          </View>

          <FlatList
            contentContainerStyle={styles.listContent}
            data={listModel.items}
            keyExtractor={(item) => item.key}
            ListEmptyComponent={
              <Text selectable style={styles.emptyText}>{loading ? t('chat.loading') : t('chat.noSessions')}</Text>
            }
            renderItem={({ item }) => (
              <SidebarListRow
                activeKey={activeKey}
                item={item}
                onClose={onClose}
                onNewChatInProject={onNewChatInProject}
                onSelect={onSelect}
                onShowMore={listModel.showMore}
                onShowProjectActions={actions.showProject}
                onShowSessionActions={actions.showSession}
                onToggleGroup={onToggleGroup}
                state={state}
              />
            )}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.footer}>
            <SidebarAction active={activeUtility === 'settings'} icon={Settings} label={t('sidebar.settings')} onPress={onOpenSettings} />
            <Pressable
              accessibilityLabel={t(networkAvailable ? `connection.${connectionStatus}` : 'connection.offline')}
              onPress={() => void onReconnect()}
              style={styles.statusButton}
            >
              <View
                style={[
                  styles.statusDot,
                  connectionStatus === 'open' && networkAvailable && styles.statusOpen,
                  !networkAvailable && styles.statusOffline,
                ]}
              />
            </Pressable>
          </View>
          <Pressable accessibilityLabel={t('app.account.logoutHint')} onLongPress={onLogout} style={styles.logoutTarget}>
            <Text style={styles.logoutHint}>{t('app.account.logoutHint')}</Text>
          </Pressable>

          <SidebarActionSheets
            actionProject={actions.actionProject}
            actionSession={actions.actionSession}
            bottomInset={insets.bottom}
            onBeginProjectRename={actions.beginProjectRename}
            onBeginSessionRename={actions.beginSessionRename}
            onRequestDelete={actions.requestDelete}
            onSetActionProject={actions.setActionProject}
            onSetActionSession={actions.setActionSession}
            onSetRenameTarget={actions.setRenameTarget}
            onSetRenameValue={actions.setRenameValue}
            onSubmitRename={actions.submitRename}
            onToggleArchived={onToggleArchived}
            onTogglePinned={onTogglePinned}
            renameTarget={actions.renameTarget}
            renameValue={actions.renameValue}
            state={state}
          />
        </View>
      </View>
    </Modal>
  );
}

type IconComponent = typeof Search;

function SidebarAction({
  active = false,
  icon: Icon,
  label,
  onPress,
}: {
  active?: boolean;
  icon: IconComponent;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, active && styles.actionButtonSelected, pressed && styles.rowPressed]}
    >
      <Icon color="#5E5D58" size={17} strokeWidth={1.8} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}
