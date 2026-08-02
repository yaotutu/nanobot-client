import { Image } from 'expo-image';
import {
  Archive,
  ArchiveRestore,
  Blocks,
  Brain,
  CalendarClock,
  ChevronRight,
  Folder,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
} from 'lucide-react-native';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  COLLAPSED_CHATS_VISIBLE_COUNT,
  groupSessions,
  isCollapsedProject,
  isFoldableChatsGroup,
  isFoldedChatsGroup,
  limitGroups,
  visibleSessionsForGroup,
  type ChatGroupLabels,
  type SessionGroup,
} from '@/features/sidebar/chat-groups';
import { formatDateTime, relativeTime, safeNumberFormat, sessionTitle, visibleSessionPreview } from '@/services/text/format';
import type { SessionAutomationJob } from '@/types/api/automations';
import type { SessionDeleteResult } from '@/types/api/chat';
import type { ConnectionStatus } from '@/types/api/runtime';
import type {
  ChatSummary,
  SidebarStatePayload,
} from '@/types/api/sidebar';

// Static Metro asset; require is the React Native asset loader.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nanobotIcon = require('../../assets/images/nanobot-icon.png');

const INITIAL_VISIBLE_SESSIONS = 160;
const VISIBLE_SESSIONS_INCREMENT = 160;

interface SidebarDrawerProps {
  visible: boolean;
  sessions: ChatSummary[];
  state: SidebarStatePayload;
  activeKey: string | null;
  loading: boolean;
  connectionStatus: ConnectionStatus;
  defaultWorkspacePath?: string | null;
  activeUtility: 'apps' | 'skills' | 'automations' | 'settings' | null;
  onClose: () => void;
  onOpenSearch: () => void;
  onOpenApps: () => void;
  onOpenSkills: () => void;
  onOpenAutomations: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onNewChatInProject: (projectPath: string, projectName: string) => void;
  onSelect: (key: string) => void;
  onTogglePinned: (key: string) => Promise<void>;
  onToggleArchived: (key: string) => Promise<void>;
  onToggleGroup: (groupId: string) => Promise<void>;
  onRename: (key: string, title: string) => Promise<void>;
  onRenameProject: (projectKey: string, title: string) => Promise<void>;
  onSetShowArchived: (show: boolean) => Promise<void>;
  onDelete: (
    key: string,
    options?: { deleteAutomations?: boolean },
  ) => Promise<SessionDeleteResult>;
  onGetSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
  onLogout: () => void;
}

type SidebarListItem =
  | { type: 'projects-label'; key: string }
  | { type: 'group'; key: string; group: SessionGroup }
  | { type: 'session'; key: string; group: SessionGroup; session: ChatSummary }
  | { type: 'fold'; key: string; groupId: string; folded: boolean; hiddenCount: number }
  | { type: 'more'; key: string; hiddenCount: number; totalCount: number };

type RenameTarget =
  | { kind: 'session'; key: string; label: string }
  | { kind: 'project'; key: string; label: string };

export function SidebarDrawer({
  visible,
  sessions,
  state,
  activeKey,
  loading,
  connectionStatus,
  defaultWorkspacePath,
  activeUtility,
  onClose,
  onOpenSearch,
  onOpenApps,
  onOpenSkills,
  onOpenAutomations,
  onOpenSettings,
  onNewChat,
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
}: SidebarDrawerProps) {
  const insets = useSafeAreaInsets();
  const { i18n, t } = useTranslation();
  const { width } = useWindowDimensions();
  const viewKey = `${state.view.show_archived}:${state.view.sort}`;
  const [visibleLimitState, setVisibleLimitState] = useState({
    key: viewKey,
    limit: INITIAL_VISIBLE_SESSIONS,
  });
  const visibleLimit = visibleLimitState.key === viewKey
    ? visibleLimitState.limit
    : INITIAL_VISIBLE_SESSIONS;
  const [actionSession, setActionSession] = useState<ChatSummary | null>(null);
  const [actionProject, setActionProject] = useState<SessionGroup | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const groupLabels = useMemo<ChatGroupLabels>(() => ({
    pinned: t('chat.groups.pinned'),
    all: t('chat.groups.all'),
    today: t('chat.groups.today'),
    yesterday: t('chat.groups.yesterday'),
    earlier: t('chat.groups.earlier'),
    archived: t('chat.groups.archived'),
  }), [t]);

  const groups = useMemo(() => groupSessions(sessions, groupLabels, {
    pinnedKeys: state.pinned_keys,
    archivedKeys: state.archived_keys,
    titleOverrides: state.title_overrides,
    projectNameOverrides: state.project_name_overrides,
    showArchived: state.view.show_archived,
    sort: state.view.sort,
    defaultWorkspacePath,
  }), [defaultWorkspacePath, groupLabels, sessions, state]);

  const limitedGroups = useMemo(
    () => limitGroups(groups, visibleLimit, activeKey, state.collapsed_groups),
    [activeKey, groups, state.collapsed_groups, visibleLimit],
  );

  const totalSessionCount = useMemo(
    () => groups.reduce(
      (total, group) => total + (isCollapsedProject(group, state.collapsed_groups) ? 0 : group.sessions.length),
      0,
    ),
    [groups, state.collapsed_groups],
  );

  const listItems = useMemo(() => {
    const items: SidebarListItem[] = [];
    const firstProjectIndex = limitedGroups.findIndex((group) => group.kind === 'project');
    let visibleSessionCount = 0;

    limitedGroups.forEach((group, index) => {
      if (index === firstProjectIndex) {
        items.push({ type: 'projects-label', key: 'projects-label' });
      }
      items.push({ type: 'group', key: `group:${group.id}`, group });
      if (group.kind === 'project' && state.collapsed_groups[group.id]) return;

      const visibleSessions = visibleSessionsForGroup(group, activeKey, state.collapsed_groups);
      visibleSessionCount += group.sessions.length;
      for (const session of visibleSessions) {
        items.push({ type: 'session', key: `session:${session.key}`, group, session });
      }
      if (isFoldableChatsGroup(group) && group.sessions.length > COLLAPSED_CHATS_VISIBLE_COUNT) {
        items.push({
          type: 'fold',
          key: `fold:${group.id}`,
          groupId: group.id,
          folded: isFoldedChatsGroup(group, state.collapsed_groups),
          hiddenCount: Math.max(0, group.sessions.length - visibleSessions.length),
        });
      }
    });

    const hiddenCount = Math.max(0, totalSessionCount - visibleSessionCount);
    if (hiddenCount > 0) {
      items.push({ type: 'more', key: 'show-more', hiddenCount, totalCount: totalSessionCount });
    }
    return items;
  }, [activeKey, limitedGroups, state.collapsed_groups, totalSessionCount]);

  const chooseSession = (key: string) => {
    onSelect(key);
    onClose();
  };

  const showSessionActions = (session: ChatSummary) => {
    setActionProject(null);
    setActionSession(session);
  };

  const beginSessionRename = (session: ChatSummary) => {
    const label = state.title_overrides[session.key] || sessionTitle(session);
    setActionSession(null);
    setRenameTarget({ kind: 'session', key: session.key, label });
    setRenameValue(label);
  };

  const beginProjectRename = (group: SessionGroup) => {
    if (!group.projectKey) return;
    setActionProject(null);
    setRenameTarget({ kind: 'project', key: group.projectKey, label: group.label });
    setRenameValue(group.label);
  };

  const submitRename = () => {
    const target = renameTarget;
    if (!target) return;
    const title = renameValue.trim();
    setRenameTarget(null);
    if (target.kind === 'session') void onRename(target.key, title);
    else void onRenameProject(target.key, title);
  };

  const requestDelete = async (session: ChatSummary) => {
    setActionSession(null);
    let automations: SessionAutomationJob[] = [];
    try {
      automations = await onGetSessionAutomations(session.key);
    } catch {
      // Backend deletion remains protected when this preflight endpoint is unavailable.
    }

    const confirmDelete = (jobs: SessionAutomationJob[], forceDeleteAutomations = false) => {
      const hasAutomations = jobs.length > 0 || forceDeleteAutomations;
      const details = hasAutomations
        ? jobs.length > 0
          ? `${t('deleteConfirm.automationsDescription')}\n\n${automationDeleteSummary(jobs, t, i18n.resolvedLanguage ?? i18n.language)}`
          : t('deleteConfirm.automationsDescription')
        : t('deleteConfirm.description');
      Alert.alert(t('deleteConfirm.title'), details, [
        { text: t('deleteConfirm.cancel'), style: 'cancel' },
        {
          text: t('deleteConfirm.confirm'),
          style: 'destructive',
          onPress: () => {
            void onDelete(session.key, hasAutomations ? { deleteAutomations: true } : undefined)
              .then((result) => {
                if (result.blocked_by_automations) confirmDelete(result.automations ?? [], true);
              })
              .catch((error) => {
                Alert.alert(t('deleteConfirm.title'), error instanceof Error ? error.message : t('settings.status.loadError'));
              });
          },
        },
      ]);
    };
    confirmDelete(automations);
  };

  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel={t('sidebar.collapse')} onPress={onClose} style={styles.backdrop} />
        <View
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
            data={listItems}
            keyExtractor={(item) => item.key}
            ListEmptyComponent={
              <Text selectable style={styles.emptyText}>{loading ? t('chat.loading') : t('chat.noSessions')}</Text>
            }
            renderItem={({ item }) => {
              if (item.type === 'projects-label') {
                return <Text style={styles.projectsTitle}>{t('chat.groups.projects')}</Text>;
              }
              if (item.type === 'group') {
                if (item.group.kind === 'project') {
                  const collapsed = Boolean(state.collapsed_groups[item.group.id]);
                  return (
                    <View style={styles.projectHeader}>
                      <Pressable
                        accessibilityLabel={`${t('chat.groups.projects')}: ${item.group.label}`}
                        accessibilityState={{ expanded: !collapsed }}
                        onLongPress={() => setActionProject(item.group)}
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
                        onPress={() => setActionProject(item.group)}
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
                return <Text style={styles.sectionTitle}>{item.group.label}</Text>;
              }
              if (item.type === 'fold') {
                return (
                  <Pressable
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
                    onPress={() => setVisibleLimitState({
                      key: viewKey,
                      limit: Math.min(item.totalCount, visibleLimit + VISIBLE_SESSIONS_INCREMENT),
                    })}
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
                  onLongPress={() => showSessionActions(session)}
                  onPress={() => chooseSession(session.key)}
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
                    onPress={() => showSessionActions(session)}
                    style={({ pressed }) => [styles.moreButton, pressed && styles.rowPressed]}
                  >
                    <MoreHorizontal color="#85837E" size={16} />
                  </Pressable>
                </Pressable>
              );
            }}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.footer}>
            <SidebarAction active={activeUtility === 'settings'} icon={Settings} label={t('sidebar.settings')} onPress={onOpenSettings} />
            <Pressable accessibilityLabel={t(`connection.${connectionStatus}`)} style={styles.statusButton}>
              <View style={[styles.statusDot, connectionStatus === 'open' && styles.statusOpen]} />
            </Pressable>
          </View>
          <Pressable onLongPress={onLogout} style={styles.logoutTarget}>
            <Text style={styles.logoutHint}>{t('app.account.logoutHint')}</Text>
          </Pressable>

          {actionSession ? (
            <View style={styles.actionOverlay}>
              <Pressable onPress={() => setActionSession(null)} style={styles.actionBackdrop} />
              <View style={[styles.actionSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <Text numberOfLines={1} style={styles.actionTitle}>
                  {state.title_overrides[actionSession.key] || sessionTitle(actionSession)}
                </Text>
                <SheetAction
                  icon={state.pinned_keys.includes(actionSession.key) ? PinOff : Pin}
                  label={state.pinned_keys.includes(actionSession.key) ? t('chat.unpin') : t('chat.pin')}
                  onPress={() => {
                    const key = actionSession.key;
                    setActionSession(null);
                    void onTogglePinned(key);
                  }}
                />
                <SheetAction icon={Pencil} label={t('chat.rename')} onPress={() => beginSessionRename(actionSession)} />
                <SheetAction
                  icon={state.archived_keys.includes(actionSession.key) ? ArchiveRestore : Archive}
                  label={state.archived_keys.includes(actionSession.key) ? t('chat.unarchive') : t('chat.archive')}
                  onPress={() => {
                    const key = actionSession.key;
                    setActionSession(null);
                    void onToggleArchived(key);
                  }}
                />
                <SheetAction destructive icon={Trash2} label={t('chat.delete')} onPress={() => void requestDelete(actionSession)} />
              </View>
            </View>
          ) : null}

          {actionProject ? (
            <View style={styles.actionOverlay}>
              <Pressable onPress={() => setActionProject(null)} style={styles.actionBackdrop} />
              <View style={[styles.actionSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <Text numberOfLines={1} style={styles.actionTitle}>{actionProject.label}</Text>
                <SheetAction icon={Pencil} label={t('chat.renameProjectTitle')} onPress={() => beginProjectRename(actionProject)} />
              </View>
            </View>
          ) : null}

          {renameTarget ? (
            <View style={styles.renameOverlay}>
              <Pressable onPress={() => setRenameTarget(null)} style={styles.actionBackdrop} />
              <View style={styles.renameCard}>
                <Text style={styles.renameTitle}>
                  {renameTarget.kind === 'project' ? t('chat.renameProjectTitle') : t('chat.renameTitle')}
                </Text>
                <TextInput
                  autoFocus
                  maxLength={120}
                  onChangeText={setRenameValue}
                  onSubmitEditing={submitRename}
                  returnKeyType="done"
                  selectTextOnFocus
                  style={styles.renameInput}
                  value={renameValue}
                />
                <View style={styles.renameActions}>
                  <Pressable onPress={() => setRenameTarget(null)} style={styles.renameButton}>
                    <Text style={styles.renameCancelText}>{t('deleteConfirm.cancel')}</Text>
                  </Pressable>
                  <Pressable onPress={submitRename} style={[styles.renameButton, styles.renamePrimary]}>
                    <Text style={styles.renamePrimaryText}>{t('chat.renameSave')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function automationDeleteSummary(jobs: SessionAutomationJob[], t: TFunction, locale: string): string {
  const visible = jobs.slice(0, 4).map((job) => {
    const schedule = automationScheduleLabel(job, t, locale);
    const next = automationNextRunLabel(job, t);
    return `• ${job.name || job.id}\n  ${schedule} · ${next}`;
  });
  const hiddenCount = Math.max(0, jobs.length - visible.length);
  if (hiddenCount > 0) visible.push(t('deleteConfirm.moreAutomations', { count: hiddenCount }));
  return visible.join('\n');
}

function automationScheduleLabel(job: SessionAutomationJob, t: TFunction, locale: string): string {
  if (job.schedule.kind === 'at' && job.schedule.at_ms) return formatDateTime(job.schedule.at_ms);
  if (job.schedule.kind === 'every' && job.schedule.every_ms) return t('deleteConfirm.schedule.every', { duration: formatDuration(job.schedule.every_ms, locale) });
  if (job.schedule.kind === 'cron' && job.schedule.expr) {
    return job.schedule.tz
      ? t('deleteConfirm.schedule.cronWithTz', { expr: job.schedule.expr, tz: job.schedule.tz })
      : t('deleteConfirm.schedule.cron', { expr: job.schedule.expr });
  }
  if (job.schedule.kind === 'local' || job.payload.kind === 'local_trigger') return t('deleteConfirm.schedule.local');
  return t('deleteConfirm.schedule.unknown');
}

function automationNextRunLabel(job: SessionAutomationJob, t: TFunction): string {
  if (!job.enabled) return t('deleteConfirm.next.disabled');
  if (job.schedule.kind === 'local' || job.payload.kind === 'local_trigger') return t('deleteConfirm.next.local');
  return job.state.next_run_at_ms
    ? t('deleteConfirm.next.label', { time: formatDateTime(job.state.next_run_at_ms) })
    : t('deleteConfirm.next.none');
}

function formatDuration(ms: number, locale: string): string {
  const units: Array<[Intl.NumberFormatOptions['unit'], number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
  ];
  for (const [unit, size] of units) {
    if (ms >= size && ms % size === 0) {
      return safeNumberFormat(locale, { style: 'unit' as const, unit, unitDisplay: 'long' as const }).format(ms / size);
    }
  }
  return safeNumberFormat(locale, { style: 'unit' as const, unit: 'minute', unitDisplay: 'long' as const })
    .format(Math.round(ms / 6_000) / 10);
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
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, active && styles.actionButtonSelected, pressed && styles.rowPressed]}
    >
      <Icon color="#5E5D58" size={17} strokeWidth={1.8} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sheetAction, pressed && styles.rowPressed]}>
      <Icon color={color} size={18} strokeWidth={1.8} />
      <Text style={[styles.sheetActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, flexDirection: 'row' },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(16,16,14,0.28)' },
  drawer: {
    height: '100%',
    backgroundColor: '#F2F1EE',
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 10,
    boxShadow: '5px 0 18px rgba(0,0,0,0.18)',
  },
  brandRow: { height: 45, justifyContent: 'center', paddingHorizontal: 8 },
  logo: { width: 34, height: 34, borderRadius: 10 },
  actions: { gap: 2, marginTop: 2 },
  actionButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 20,
    paddingHorizontal: 13,
  },
  actionLabel: { color: '#3E3D39', fontSize: 13, fontWeight: '500' },
  actionButtonSelected: { backgroundColor: '#E3E1DC' },
  rowPressed: { backgroundColor: '#E6E4DF' },
  listContent: { paddingTop: 12, paddingBottom: 12 },
  projectsTitle: {
    paddingHorizontal: 12,
    paddingTop: 3,
    paddingBottom: 5,
    color: '#8A8984',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionTitle: {
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 4,
    color: '#8A8984',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyText: { color: '#8B8A86', fontSize: 12, lineHeight: 19, paddingHorizontal: 13, paddingVertical: 16 },
  projectHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 4,
  },
  projectMain: {
    minWidth: 0,
    flex: 1,
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  projectName: { minWidth: 0, flex: 1, color: '#6F6D68', fontSize: 12, fontWeight: '600' },
  projectTime: { color: '#999792', fontSize: 10 },
  projectAction: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  sessionRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 11,
    paddingLeft: 10,
    paddingRight: 5,
    paddingVertical: 5,
    gap: 6,
  },
  projectSessionRow: { paddingLeft: 38 },
  sessionRowSelected: { backgroundColor: '#E3E1DC' },
  sessionCopy: { minWidth: 0, flex: 1 },
  moreButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sessionTitle: { minWidth: 0, flex: 1, color: '#3B3A36', fontSize: 13, fontWeight: '500' },
  time: { color: '#999792', fontSize: 10, lineHeight: 14 },
  preview: { color: '#96948F', fontSize: 11, lineHeight: 15, marginTop: 1 },
  foldButton: { minHeight: 30, justifyContent: 'center', borderRadius: 11, marginHorizontal: 4, paddingHorizontal: 10 },
  showMoreButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, marginTop: 4 },
  foldText: { color: '#8A8984', fontSize: 12, fontWeight: '500' },
  footer: {
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DFDDD8',
  },
  statusButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C5A24A' },
  statusOpen: { backgroundColor: '#4FA86C' },
  logoutTarget: { alignItems: 'center', paddingBottom: 2 },
  logoutHint: { color: '#ABA9A4', fontSize: 9 },
  actionOverlay: { position: 'absolute', inset: 0, justifyContent: 'flex-end' },
  actionBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(16,16,14,0.28)' },
  actionSheet: {
    backgroundColor: '#FAF9F7',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 14,
    boxShadow: '0 -8px 30px rgba(0,0,0,0.2)',
  },
  actionTitle: { color: '#777570', fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 },
  sheetAction: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  sheetActionText: { fontSize: 15, fontWeight: '500' },
  renameOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  renameCard: { width: '100%', borderRadius: 17, backgroundColor: '#FFFFFF', padding: 17, boxShadow: '0 14px 34px rgba(0,0,0,0.25)' },
  renameTitle: { color: '#292824', fontSize: 17, fontWeight: '600', marginBottom: 14 },
  renameInput: { height: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D4D2CD', borderRadius: 11, paddingHorizontal: 12, color: '#292824', fontSize: 15 },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 15 },
  renameButton: { minWidth: 72, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  renamePrimary: { backgroundColor: '#292824' },
  renameCancelText: { color: '#6F6D68', fontSize: 14, fontWeight: '500' },
  renamePrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
