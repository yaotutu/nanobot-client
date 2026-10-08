import { Image } from 'expo-image';
import Search from 'lucide-react-native/icons/search';
import Plus from 'lucide-react-native/icons/plus';
import Settings from 'lucide-react-native/icons/settings';
import X from 'lucide-react-native/icons/x';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatGroupLabels } from '@/features/sidebar/chat-groups';
import { useSidebarActions } from '@/features/sidebar/hooks/use-sidebar-actions';
import { useSidebarListModel } from '@/features/sidebar/hooks/use-sidebar-list-model';
import type { SessionDeleteResult } from '@/types/api/chat/thread';
import type { ConnectionStatus } from '@/types/api/runtime';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';
import type { Palette } from '@/ui/palette';
import { SidebarActionSheets } from './SidebarActionSheets';
import { SidebarListRow } from './SidebarListRow';
import { createConversationStyles } from './conversation-sheet-styles';

// Metro 静态资源沿用 nanobot 品牌，不引入参考项目的业务和品牌资源。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nanobotIcon = require('../../../../assets/images/nanobot-icon.png');

interface ConversationSheetProps {
  visible: boolean;
  updateAvailable: boolean;
  colors: Palette;
  sessions: ChatSummary[];
  state: SidebarStatePayload;
  activeKey: string | null;
  loading: boolean;
  connectionStatus: ConnectionStatus;
  networkAvailable: boolean;
  defaultWorkspacePath?: string | null;
  onClose: () => void;
  onOpenSearch: () => void;
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
  onDelete: (key: string) => Promise<SessionDeleteResult>;
}

/** 仅替换会话入口的展示方式；会话分组、持久化与所有操作仍由 nanobot 控制器负责。 */
export function ConversationSheet(props: ConversationSheetProps) {
  const {
    visible,
    colors,
    sessions,
    state,
    activeKey,
    loading,
    connectionStatus,
    networkAvailable,
    defaultWorkspacePath,
    onClose,
    onOpenSearch,
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
  } = props;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  // 左侧抽屉宽度只按窗口尺寸响应：手机留出主页面上下文，宽屏使用固定导航宽度。
  const drawerWidth = Math.min(width < 600 ? width * 0.88 : 420, width);
  const styles = useMemo(() => createConversationStyles(colors), [colors]);
  // Modal 的 slide 只能从底部进入；这里用 translateX 显式实现从左滑入，和左上角入口方向一致。
  // Animated.Value 是跨渲染保持不变的动画状态，放在 useState 的惰性初始化中，避免在渲染期读取 ref.current。
  const [translateX] = useState(() => new Animated.Value(-drawerWidth));

  useEffect(() => {
    // 抽屉每次打开都从左侧滑入；关闭由父层卸载 Modal，避免在测试和返回流程中引入额外退出状态。
    if (!visible) return;
    translateX.setValue(-drawerWidth);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [drawerWidth, translateX, visible]);

  const statusLabel = t(networkAvailable ? `connection.${connectionStatus}` : 'connection.offline');
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
    onRename,
    onRenameProject,
    onDelete,
  });

  // 系统返回键与遮罩先退出操作/重命名层，避免一次返回把整个会话列表都关掉。
  const dismiss = () => {
    if (actions.renameTarget) actions.setRenameTarget(null);
    else if (actions.actionSession) actions.setActionSession(null);
    else if (actions.actionProject) actions.setActionProject(null);
    else onClose();
  };

  const hasActionLayer = Boolean(actions.actionSession || actions.actionProject || actions.renameTarget);

  if (!visible) return null;

  return (
    <Modal
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
      transparent
      visible
    >
      {/* 抽屉内仍有重命名输入框，保留统一键盘避让；布局不再依赖底部 Sheet 的剩余高度测量。 */}
      <KeyboardAvoidingView
        behavior="height"
        style={styles.keyboardRoot}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('sidebar.closeConversations')}
            onPress={dismiss}
            style={styles.backdrop}
          />
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                width: drawerWidth,
                paddingTop: Math.max(insets.top, 12),
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [{ translateX }],
              },
            ]}
          >
            {/* 子层打开时隐藏底层的无障碍焦点，避免读屏仍能选中被遮挡的会话。 */}
            <View
              collapsable={false}
              accessibilityElementsHidden={hasActionLayer}
              importantForAccessibility={hasActionLayer ? 'no-hide-descendants' : 'auto'}
              style={styles.content}
            >
              <View style={styles.header}>
                <Image source={nanobotIcon} style={styles.logo} />
                <View style={styles.heading}>
                  <Text style={styles.title}>{t('app.brand')}</Text>
                  <Text style={styles.subtitle}>{t('sidebar.conversations')}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('sidebar.closeConversations')}
                  onPress={dismiss}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.rowPressed]}
                >
                  <X color={colors.muted} size={22} strokeWidth={1.8} />
                </Pressable>
              </View>

              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onNewChat();
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.newChatButton,
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <Plus color="#FFFFFF" size={20} strokeWidth={1.8} />
                  <Text style={styles.newChatLabel}>{t('sidebar.newChat')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('sidebar.searchAria')}
                  onPress={onOpenSearch}
                  style={({ pressed }) => [styles.actionButton, styles.utilityButton, pressed && styles.rowPressed]}
                >
                  <Search color={colors.muted} size={20} strokeWidth={1.8} />
                </Pressable>
              </View>
              <View style={styles.listHeading}>
                <Text style={styles.listTitle}>{t('sidebar.recent')}</Text>
                {state.archived_keys.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: state.view.show_archived }}
                    onPress={() => void onSetShowArchived(!state.view.show_archived)}
                    style={({ pressed }) => [styles.archivedToggle, pressed && styles.rowPressed]}
                  >
                    <Text style={styles.archivedText}>
                      {state.view.show_archived
                        ? t('chat.hideArchived')
                        : `${t('chat.groups.archived')} (${state.archived_keys.length})`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <FlatList
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
                data={listModel.items}
                keyExtractor={(item) => item.key}
                ListEmptyComponent={
                  <Text selectable style={styles.emptyText}>
                    {loading ? t('chat.loading') : t('chat.noSessions')}
                  </Text>
                }
                renderItem={({ item }) => (
                  <SidebarListRow
                    colors={colors}
                    styles={styles}
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

              {/* 全局设置与连接状态固定在列表之外；右上角的 Chat options 只管理当前会话。 */}
              <View style={styles.footer}>
                <Pressable
                  accessibilityLabel={t('sidebar.settings')}
                  accessibilityHint={props.updateAvailable ? t('updates.updateAvailableA11y') : undefined}
                  accessibilityRole="button"
                  onPress={onOpenSettings}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.rowPressed]}
                >
                  <Settings color={colors.muted} size={18} strokeWidth={1.8} />
                  <Text style={styles.actionLabel}>{t('sidebar.settings')}</Text>
                  {props.updateAvailable ? <View testID="settings-entry-update-badge" style={styles.updateBadge} /> : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={statusLabel}
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
                  <Text style={styles.statusLabel}>{statusLabel}</Text>
                </Pressable>
              </View>
            </View>

            <SidebarActionSheets
              colors={colors}
              styles={styles}
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
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
