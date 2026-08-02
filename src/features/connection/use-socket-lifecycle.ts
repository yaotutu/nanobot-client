import { useEffect, useRef } from 'react';

import { useAuthStore, selectAuthPhase, selectBootstrap } from '@/features/auth/store';
import { useChatStore } from '@/features/chat/store';
import { useWorkspacesStore } from '@/features/workspaces/store';
import i18n from '@/i18n';
import { deriveWsUrl } from '@/services/api/bootstrap';
import { DEFAULT_SERVER_URL as SERVER_URL } from '@/services/api/config';

import { createNanobotSocket, type NanobotSocket } from './socket-transport';
import { useConnectionStore } from './store';

export function useSocketLifecycle(refreshCanonical: () => Promise<void>) {
  const phase = useAuthStore(selectAuthPhase);
  const bootstrap = useAuthStore(selectBootstrap);
  const refreshAuth = useAuthStore((state) => state.refreshBootstrap);

  const applyInboundEvent = useChatStore((state) => state.applyInboundEvent);
  const applyRunStatus = useChatStore((state) => state.applyRunStatus);
  const setChatError = useChatStore((state) => state.setError);
  const setRuntimeModelName = useChatStore((state) => state.setRuntimeModelName);
  const setStreamError = useChatStore((state) => state.setStreamError);

  const markOpened = useConnectionStore((state) => state.markOpened);
  const markReconnectNeeded = useConnectionStore((state) => state.markReconnectNeeded);
  const setConnectionStatus = useConnectionStore((state) => state.setStatus);

  const refreshWorkspaces = useWorkspacesStore((state) => state.refresh);

  const socketRef = useRef<NanobotSocket | null>(null);
  const refreshCanonicalRef = useRef(refreshCanonical);

  useEffect(() => {
    refreshCanonicalRef.current = refreshCanonical;
  }, [refreshCanonical]);

  useEffect(() => {
    if (!bootstrap || phase !== 'ready') return;

    const socket = createNanobotSocket({
      url: deriveWsUrl(
        SERVER_URL,
        bootstrap.ws_path,
        bootstrap.token,
        bootstrap.ws_url ?? null,
      ),
      reauthenticate: async () => {
        try {
          await refreshAuth();
          const fresh = useAuthStore.getState().bootstrap;
          if (!fresh) return null;
          return deriveWsUrl(
            SERVER_URL,
            fresh.ws_path,
            fresh.token,
            fresh.ws_url ?? null,
          );
        } catch {
          return null;
        }
      },
      maxFrameBytes: bootstrap.limits?.transport.max_frame_bytes,
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

    const offEvent = socket.onEvent((event) => {
      applyInboundEvent(event);
    });

    return () => {
      offStatus();
      offRunStatus();
      offTransportError();
      offEvent();
      socket.close();
      socketRef.current = null;
    };
    // Socket identity follows authentication. Store actions are stable Zustand references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.token, phase]);

  useEffect(() => {
    if (!bootstrap) return;
    const url = deriveWsUrl(
      SERVER_URL,
      bootstrap.ws_path,
      bootstrap.token,
      bootstrap.ws_url ?? null,
    );
    socketRef.current?.updateUrl(url);
    socketRef.current?.updateMaxFrameBytes(bootstrap.limits?.transport.max_frame_bytes);
    setRuntimeModelName(bootstrap.model_name?.trim() || null);
    // Keep the existing socket synchronized when a bootstrap renewal completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.expires_in]);

  return socketRef;
}
