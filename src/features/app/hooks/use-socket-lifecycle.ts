import { useEffect, useRef } from 'react';

import { useAuthStore, selectAuthPhase, selectBootstrap } from '@/features/auth/state';
import { useChatStore } from '@/features/chat/state';
import { useWorkspacesStore } from '@/features/workspaces/state';
import i18n from '@/i18n';
import { deriveWsUrl } from '@/services/api/bootstrap';
import {
  configureSidebarMutationTransport,
  useSidebarStore,
} from '@/features/sidebar/state';
import { getServerUrl } from '@/services/api/config';

import { createNanobotSocket, type NanobotSocket } from '@/features/connection/transport';
import { useConnectionStore } from '@/features/connection/state';

export function useSocketLifecycle(refreshCanonical: () => Promise<void>) {
  const phase = useAuthStore(selectAuthPhase);
  const bootstrap = useAuthStore(selectBootstrap);
  const refreshAuth = useAuthStore((state) => state.refreshBootstrap);

  const applyInboundEvent = useChatStore((state) => state.applyInboundEvent);
  const applyRunStatus = useChatStore((state) => state.applyRunStatus);
  const setChatError = useChatStore((state) => state.setError);
  const setRuntimeModelName = useChatStore((state) => state.setRuntimeModelName);
  const setStreamError = useChatStore((state) => state.setStreamError);

  const markActivity = useConnectionStore((state) => state.markActivity);
  const markOpened = useConnectionStore((state) => state.markOpened);
  const markReconnectNeeded = useConnectionStore((state) => state.markReconnectNeeded);
  const setConnectionStatus = useConnectionStore((state) => state.setStatus);

  const refreshWorkspaces = useWorkspacesStore((state) => state.refresh);
  const applyRemoteSidebarState = useSidebarStore((state) => state.applyRemoteSidebarState);
  const refreshSessions = useSidebarStore((state) => state.refresh);

  const socketRef = useRef<NanobotSocket | null>(null);
  const refreshCanonicalRef = useRef(refreshCanonical);

  useEffect(() => {
    refreshCanonicalRef.current = refreshCanonical;
  }, [refreshCanonical]);

  // Sidebar 重命名和删除必须复用当前 bootstrap token 建立的 WebUI mutation 通道。
  // 注入 getter 而不是 socket 实例，可以自然跟随重连时 socketRef 的替换。
  useEffect(() => {
    configureSidebarMutationTransport(() => socketRef.current);
    return () => configureSidebarMutationTransport(null);
  }, []);

  useEffect(() => {
    if (phase !== 'ready') return;
    const currentBootstrap = useAuthStore.getState().bootstrap;
    if (!currentBootstrap) return;

    const socket = createNanobotSocket({
      url: deriveWsUrl(
        getServerUrl(),
        currentBootstrap.ws_path,
        currentBootstrap.token,
        currentBootstrap.ws_url ?? null,
      ),
      reauthenticate: async () => {
        try {
          const fresh = await refreshAuth('socket-reauthentication');
          if (!fresh) return null;
          return deriveWsUrl(
            getServerUrl(),
            fresh.ws_path,
            fresh.token,
            fresh.ws_url ?? null,
          );
        } catch {
          return null;
        }
      },
      maxFrameBytes: currentBootstrap.limits?.transport.max_frame_bytes,
    });
    socketRef.current = socket;

    const offStatus = socket.onStatus((status) => {
      setConnectionStatus(status);
      if (status === 'open') {
        markOpened();
        if (useConnectionStore.getState().needsCanonicalReconnect) {
          markReconnectNeeded();
          void refreshCanonicalRef.current();
        }
      } else if (
        status === 'reconnecting'
        || status === 'error'
        || status === 'closed'
      ) {
        if (useConnectionStore.getState().hasOpenedSocket) markReconnectNeeded();
      }
    });

    const offRunStatus = socket.onRunStatus((chatId, startedAt) => {
      applyRunStatus(chatId, startedAt);
    });

    const offTransportError = socket.onTransportError((error) => {
      if (error.kind === 'workspace_scope_rejected') {
        setChatError(i18n.t('errors.workspaceScopeRejected.body'));
        void refreshWorkspaces();
      }
      setStreamError(error);
    });

    // 会话行更新可能由其他客户端触发；使用短防抖合并一轮刷新，避免每个 turn 结束都拉接口。
    let sessionRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSessionsRefresh = () => {
      if (sessionRefreshTimer) return;
      sessionRefreshTimer = setTimeout(() => {
        sessionRefreshTimer = null;
        void refreshSessions();
      }, 250);
    };

    const offEvent = socket.onEvent((event) => {
      if (event.event === 'sidebar_state_updated') {
        applyRemoteSidebarState(event.state);
      } else if (event.event === 'session_updated') {
        scheduleSessionsRefresh();
      }
      markActivity();
      applyInboundEvent(event);
    });

    return () => {
      if (sessionRefreshTimer) clearTimeout(sessionRefreshTimer);
      offStatus();
      offRunStatus();
      offTransportError();
      offEvent();
      socket.close();
      socketRef.current = null;
    };
    // Socket identity follows authentication. Store actions are stable Zustand references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (!bootstrap) return;
    const url = deriveWsUrl(
      getServerUrl(),
      bootstrap.ws_path,
      bootstrap.token,
      bootstrap.ws_url ?? null,
    );
    socketRef.current?.updateUrl(url);
    socketRef.current?.updateMaxFrameBytes(bootstrap.limits?.transport.max_frame_bytes);
    setRuntimeModelName(bootstrap.model_name?.trim() || null);
    // Keep the existing socket synchronized when a bootstrap renewal completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.token, bootstrap?.limits?.transport.max_frame_bytes]);

  return socketRef;
}
