import { useCallback, type RefObject } from 'react';

import { useChatStore } from '@/features/chat/store';
import type {
  MessageSendResult,
  NanobotSocket,
} from '@/features/connection/socket-transport';
import { useSidebarStore } from '@/features/sidebar/store';
import i18n from '@/i18n';
import { resolveRuntimeClientPolicy } from '@/services/runtime/runtime-capabilities';
import { normalizeWorkspaceScope } from '@/services/runtime/workspace-paths';
import { formatQuotedUserMessage, normalizeQuotedContext } from '@/services/text/user-quote-format';
import type {
  SendAttachment,
  SendMessageOptions,
  UIMessage,
} from '@/types/api/chat';
import type { BootstrapResponse } from '@/types/api/runtime';
import type { ChatSummary } from '@/types/api/sidebar';
import type { WorkspaceScopePayload } from '@/types/api/workspaces';

import { chatIdFromKey } from '../model/chat-key';

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateOutboundMessage(
  bootstrap: BootstrapResponse,
  chatId: string,
  content: string,
  attachments: SendAttachment[],
  options: SendMessageOptions,
): void {
  const limits = bootstrap.limits;
  if (!limits) return;
  if (utf8Bytes(content) > limits.message.max_text_bytes) {
    throw new Error(i18n.t('thread.composer.textTooLarge', { max: limits.message.max_text_bytes }));
  }
  if (attachments.length > limits.attachments.max_count) {
    throw new Error(
      i18n.t('thread.composer.imageRejected.too_many_attachments', {
        max: limits.attachments.max_count,
      }),
    );
  }
  const projectedFrame = JSON.stringify({
    type: 'message',
    chat_id: chatId,
    content,
    media: attachments.map((item) => item.media),
    ...(options.cliApps?.length ? { cli_apps: options.cliApps } : {}),
    ...(options.mcpPresets?.length ? { mcp_presets: options.mcpPresets } : {}),
    ...(options.quotedContext?.trim() ? { quoted_context: options.quotedContext.trim() } : {}),
    ...(options.workspaceScope ? { workspace_scope: options.workspaceScope } : {}),
    turn_id: '00000000-0000-4000-8000-000000000000',
    webui: true,
  });
  if (utf8Bytes(projectedFrame) > limits.transport.max_frame_bytes) {
    throw new Error(i18n.t('thread.composer.imageRejected.transport_too_large'));
  }
}

function optimisticUserMessage(
  content: string,
  turnId: string,
  attachments: SendAttachment[],
  options: SendMessageOptions,
): UIMessage {
  return {
    id: `user-${turnId}`,
    role: 'user',
    content,
    createdAt: Date.now(),
    turnId,
    turnPhase: 'user',
    ...(attachments.length ? { media: attachments.map((item) => item.preview) } : {}),
    ...(options.cliApps?.length ? { cliApps: options.cliApps } : {}),
    ...(options.mcpPresets?.length ? { mcpPresets: options.mcpPresets } : {}),
  };
}

export function useChatCommands({
  activeKey,
  activeWorkspaceScope,
  bootstrap,
  messages,
  sessions,
  socketRef,
}: {
  activeKey: string | null;
  activeWorkspaceScope: WorkspaceScopePayload | null;
  bootstrap: BootstrapResponse | null;
  messages: UIMessage[];
  sessions: ChatSummary[];
  socketRef: RefObject<NanobotSocket | null>;
}) {
  const sendMessage = useCallback(
    async (rawContent: string, attachments: SendAttachment[] = [], options: SendMessageOptions = {}) => {
      if (!bootstrap) return;
      const content = rawContent.trim();
      const quotedContext = normalizeQuotedContext(options.quotedContext);
      const normalizedOptions: SendMessageOptions = quotedContext
        ? { ...options, quotedContext }
        : { ...options, quotedContext: undefined };
      const outboundContent = quotedContext ? formatQuotedUserMessage(content, quotedContext) : content;
      const socket = socketRef.current;
      if ((!outboundContent && attachments.length === 0) || !socket) return;

      const sideChannel = normalizedOptions.sideChannel === true;
      const continueActiveTurn = normalizedOptions.continueActiveTurn === true;
      const workspaceScope = normalizedOptions.workspaceScope
        ? normalizeWorkspaceScope(normalizedOptions.workspaceScope)
        : activeWorkspaceScope
          ? normalizeWorkspaceScope(activeWorkspaceScope)
          : null;

      let chatId = chatIdFromKey(activeKey) ?? '';
      if (!chatId) {
        try {
          chatId = await socket.newChat(5_000, workspaceScope);
          const newKey = `websocket:${chatId}`;
          const now = new Date().toISOString();
          useSidebarStore.getState().addOptimistic({
            key: newKey,
            channel: 'websocket',
            chatId,
            createdAt: now,
            updatedAt: now,
            title: '',
            preview: '',
            workspaceScope,
          });
          useChatStore.getState().selectSession(newKey, useSidebarStore.getState().sessions);
          if (workspaceScope) useChatStore.getState().setWorkspaceOverride(chatId, workspaceScope);
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : i18n.t('chat.createFailed');
          useChatStore.getState().setError(message);
          throw caught;
        }
      }

      validateOutboundMessage(bootstrap, chatId, outboundContent, attachments, {
        ...normalizedOptions,
        workspaceScope,
      });

      const send: MessageSendResult = socket.sendMessage(
        chatId,
        outboundContent,
        attachments.length ? attachments.map((item) => item.media) : undefined,
        {
          cliApps: normalizedOptions.cliApps,
          mcpPresets: normalizedOptions.mcpPresets,
          workspaceScope,
          startsNewRun: !(sideChannel || continueActiveTurn),
        },
      );

      const store = useChatStore.getState();
      if (sideChannel) store.markSideChannel(send.turnId);
      useChatStore.setState((state) => ({
        messages: [
          ...state.messages,
          optimisticUserMessage(outboundContent, send.turnId, attachments, normalizedOptions),
        ],
      }));
      if (!sideChannel) store.setTurnActive(true);
      store.prepareUserTurn(send.turnId);

      try {
        await send.accepted;
      } catch (caught) {
        useChatStore.setState((state) => ({
          messages: state.messages.filter((message) => message.turnId !== send.turnId),
        }));
        if (!sideChannel && !continueActiveTurn) {
          useChatStore.getState().setTurnActive(false);
          useChatStore.getState().setRunStartedAt(null);
        }
        const message = caught instanceof Error ? caught.message : i18n.t('thread.sendFailed');
        useChatStore.getState().setError(message);
        throw caught;
      }
    },
    [activeKey, activeWorkspaceScope, bootstrap, socketRef],
  );

  const stopTurn = useCallback(() => {
    const socket = socketRef.current;
    const chatId = chatIdFromKey(activeKey);
    if (!socket || !chatId) return;
    try {
      socket.stopTurn(chatId);
    } catch {
      // A disconnected socket is already equivalent to a stopped local turn.
    }
    useChatStore.getState().setTurnActive(false);
    useChatStore.getState().setRunStartedAt(null);
  }, [activeKey, socketRef]);

  const changeModelPreset = useCallback(async (name: string): Promise<void> => {
    const socket = socketRef.current;
    const chatId = chatIdFromKey(activeKey);
    if (!socket || !chatId) return;
    await socket.sendSystemCommand(chatId, `/model ${name}`);
  }, [activeKey, socketRef]);

  const transcribeAudio = useCallback(async (dataUrl: string, options?: { durationMs?: number }) => {
    const socket = socketRef.current;
    if (!socket) throw new Error(i18n.t('connection.closed'));
    return socket.transcribeAudio(dataUrl, { durationMs: options?.durationMs });
  }, [socketRef]);

  const restartServer = useCallback(() => {
    const policy = resolveRuntimeClientPolicy(bootstrap);
    if (!policy.canRestart) {
      useChatStore.getState().setError(
        policy.restartUnavailableReason
          ?? i18n.t('app.system.restartUnavailable', { defaultValue: 'This client cannot restart nanobot' }),
      );
      return;
    }
    const socket = socketRef.current;
    const chatId = chatIdFromKey(activeKey) ?? sessions[0]?.chatId ?? '';
    if (!socket || !chatId) {
      useChatStore.getState().setError(
        i18n.t('app.system.restartNeedsTopic', { defaultValue: 'No topic is available to restart nanobot' }),
      );
      return;
    }
    const restart = socket.sendMessage(chatId, '/restart', undefined, { startsNewRun: false });
    useChatStore.getState().markSideChannel(restart.turnId);
    void restart.accepted.catch(() => {
      useChatStore.getState().setError(
        i18n.t('app.system.restartFailed', { defaultValue: 'Could not restart nanobot' }),
      );
    });
  }, [activeKey, bootstrap, sessions, socketRef]);

  const retryFromMessage = useCallback(async (messageId: string) => {
    if (!socketRef.current || !chatIdFromKey(activeKey)) return;
    const message = messages.find((item) => item.id === messageId);
    await sendMessage(message?.content ?? '', [], { continueActiveTurn: false });
  }, [activeKey, messages, sendMessage, socketRef]);

  return {
    changeModelPreset,
    restartServer,
    retryFromMessage,
    sendMessage,
    stopTurn,
    transcribeAudio,
  };
}
