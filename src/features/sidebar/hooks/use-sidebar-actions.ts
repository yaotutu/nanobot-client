import type { TFunction } from 'i18next';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import type { SessionGroup } from '@/features/sidebar/chat-groups';
import { sessionTitle } from '@/services/text/format';
import type { SessionDeleteResult } from '@/types/api/chat/thread';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';

export type RenameTarget =
  | { kind: 'session'; key: string; label: string }
  | { kind: 'project'; key: string; label: string };

export function useSidebarActions(options: {
  state: SidebarStatePayload;
  t: TFunction;
  onRename: (key: string, title: string) => Promise<void>;
  onRenameProject: (projectKey: string, title: string) => Promise<void>;
  onDelete: (key: string) => Promise<SessionDeleteResult>;
}) {
  const { state, t, onRename, onRenameProject, onDelete } = options;
  const [actionSession, setActionSession] = useState<ChatSummary | null>(null);
  const [actionProject, setActionProject] = useState<SessionGroup | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const deletingKeysRef = useRef(new Set<string>());

  const showSession = (session: ChatSummary) => {
    setActionProject(null);
    setActionSession(session);
  };
  const showProject = (project: SessionGroup) => {
    setActionSession(null);
    setActionProject(project);
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
    if (deletingKeysRef.current.has(session.key)) return;
    deletingKeysRef.current.add(session.key);
    const release = () => deletingKeysRef.current.delete(session.key);
    Alert.alert(t('deleteConfirm.title'), t('deleteConfirm.description'), [
      { text: t('deleteConfirm.cancel'), style: 'cancel', onPress: release },
      {
        text: t('deleteConfirm.confirm'), style: 'destructive', onPress: () => {
          // 不发送 delete_automations：客户端不再管理任务，关联任务必须由服务端安全拦截。
          void onDelete(session.key).then((result) => {
            if (result.blocked_by_automations) {
              Alert.alert(t('deleteConfirm.title'), t('deleteConfirm.blockedByAutomations'));
            }
          }).catch((error: unknown) => {
            Alert.alert(t('deleteConfirm.title'), error instanceof Error ? error.message : t('settings.status.loadError'));
          }).finally(release);
        },
      },
    ], { cancelable: true, onDismiss: release });
  };

  return {
    actionSession,
    actionProject,
    renameTarget,
    renameValue,
    setActionSession,
    setActionProject,
    setRenameTarget,
    setRenameValue,
    showSession,
    showProject,
    beginSessionRename,
    beginProjectRename,
    submitRename,
    requestDelete,
  };
}
