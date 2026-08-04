import type { TFunction } from 'i18next';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import type { SessionGroup } from '@/features/sidebar/chat-groups';
import { automationDeleteSummary } from '@/features/sidebar/sidebar-list-model';
import { sessionTitle } from '@/services/text/format';
import type { SessionAutomationJob } from '@/types/api/automations';
import type { SessionDeleteResult } from '@/types/api/chat/thread';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';

export type RenameTarget =
  | { kind: 'session'; key: string; label: string }
  | { kind: 'project'; key: string; label: string };

export function useSidebarActions(options: {
  state: SidebarStatePayload;
  t: TFunction;
  locale: string;
  onRename: (key: string, title: string) => Promise<void>;
  onRenameProject: (projectKey: string, title: string) => Promise<void>;
  onDelete: (key: string, options?: { deleteAutomations?: boolean }) => Promise<SessionDeleteResult>;
  onGetSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
}) {
  const { state, t, locale, onRename, onRenameProject, onDelete, onGetSessionAutomations } = options;
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
    let automations: SessionAutomationJob[] = [];
    try {
      try {
        automations = await onGetSessionAutomations(session.key);
      } catch {
        // Backend deletion remains protected when this preflight endpoint is unavailable.
      }
      const confirmDelete = (jobs: SessionAutomationJob[], forceDeleteAutomations = false) => {
        const hasAutomations = jobs.length > 0 || forceDeleteAutomations;
        const details = hasAutomations
          ? jobs.length > 0
            ? `${t('deleteConfirm.automationsDescription')}\n\n${automationDeleteSummary(jobs, t, locale)}`
            : t('deleteConfirm.automationsDescription')
          : t('deleteConfirm.description');
        Alert.alert(t('deleteConfirm.title'), details, [
          { text: t('deleteConfirm.cancel'), style: 'cancel', onPress: () => deletingKeysRef.current.delete(session.key) },
          {
            text: t('deleteConfirm.confirm'),
            style: 'destructive',
            onPress: () => {
              void onDelete(session.key, hasAutomations ? { deleteAutomations: true } : undefined)
                .then((result) => {
                  if (result.blocked_by_automations) confirmDelete(result.automations ?? [], true);
                  else deletingKeysRef.current.delete(session.key);
                })
                .catch((error) => {
                  deletingKeysRef.current.delete(session.key);
                  Alert.alert(t('deleteConfirm.title'), error instanceof Error ? error.message : t('settings.status.loadError'));
                });
            },
          },
        ]);
      };
      confirmDelete(automations);
    } catch {
      deletingKeysRef.current.delete(session.key);
    }
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
