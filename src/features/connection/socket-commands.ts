import { SocketOutboundQueue } from '@/features/connection/socket-outbound-queue';
import { SocketPendingRegistry } from '@/features/connection/socket-pending-registry';
import {
  SYSTEM_COMMAND_TURN_PREFIX,
  createTurnId,
  frameFitsTransport,
  type MessageSendResult,
  type OutboundFrame,
} from '@/features/connection/socket-protocol';
import type {
  OutboundMedia,
  UICliAppAttachment,
  UIMcpPresetAttachment,
} from '@/types/api/chat/media';
import type { WorkspaceScopePayload } from '@/types/api/workspaces';

const MESSAGE_ACCEPT_TIMEOUT_MS = 20_000;

export interface SocketSendMessageOptions {
  cliApps?: UICliAppAttachment[];
  mcpPresets?: UIMcpPresetAttachment[];
  quotedContext?: string;
  workspaceScope?: WorkspaceScopePayload | null;
  startsNewRun?: boolean;
  acceptanceTimeoutMs?: number;
}

interface SocketCommandsOptions {
  pending: SocketPendingRegistry;
  outbound: SocketOutboundQueue;
  knownChats: Set<string>;
  isNetworkAvailable: () => boolean;
  maxFrameBytes: () => number | undefined;
  queueSend: (queueId: string, frame: OutboundFrame) => void;
  sendIfOpen: (frame: OutboundFrame) => boolean;
}

/**
 * WebSocket 对外命令集合。
 *
 * 这里显式描述返回接口，而不是暴露内部闭包，便于 transport 只依赖稳定的命令契约。
 * 命令层只负责协议帧、请求生命周期和待发送队列，不负责建连、重连或入站事件路由。
 */
export interface SocketCommands {
  attach: (chatId: string) => void;
  newChat: (timeoutMs?: number, workspaceScope?: WorkspaceScopePayload | null) => Promise<string>;
  forkChat: (
    sourceChatId: string,
    beforeUserIndex: number,
    title?: string,
    timeoutMs?: number,
  ) => Promise<string>;
  sendMessage: (
    chatId: string,
    content: string,
    media?: OutboundMedia[],
    options?: SocketSendMessageOptions,
  ) => MessageSendResult;
  sendSystemCommand: (chatId: string, command: string, timeoutMs?: number) => Promise<void>;
  transcribeAudio: (
    dataUrl: string,
    options?: { durationMs?: number; timeoutMs?: number },
  ) => Promise<string>;
  setWorkspaceScope: (chatId: string, scope: WorkspaceScopePayload) => void;
  stopTurn: (chatId: string) => void;
}

/**
 * 创建 WebSocket 命令处理器。
 *
 * `knownChats`、pending registry 与 outbound queue 都由 transport 持有，并以共享引用传入。
 * 因此闭包中对集合和注册表的修改会立即反映到 transport；这里不会复制状态，也不会形成
 * 第二套连接状态。`queueSend` 只承接“当前未成功写入 socket”的协议帧，真正的 flush 时机
 * 仍由 transport 在连接打开后统一决定。
 */
export function createSocketCommands(options: SocketCommandsOptions): SocketCommands {
  const attach = (chatId: string): void => {
    if (!chatId.trim()) return;
    options.knownChats.add(chatId);

    // attach 不进入待发送队列：断线重连后，transport 会统一重放全部 knownChats，
    // 若此处也排队会导致同一 chat 被重复 attach。
    options.sendIfOpen({ type: 'attach', chat_id: chatId });
  };

  const newChat = (
    timeoutMs = 5_000,
    workspaceScope?: WorkspaceScopePayload | null,
  ): Promise<string> => {
    if (!options.isNetworkAvailable()) {
      return Promise.reject(new Error('network_unavailable'));
    }
    if (options.pending.hasNewChat()) {
      return Promise.reject(new Error('newChat already in flight'));
    }
    const queueId = options.outbound.createId('new-chat');
    const request = options.pending.createNewChat(
      timeoutMs,
      'newChat timeout',
      // 请求无论成功、失败还是超时，都必须移除尚未发出的对应帧，避免恢复网络后发送过期请求。
      () => options.outbound.remove(queueId),
    );
    options.queueSend(queueId, {
      type: 'new_chat',
      ...(workspaceScope ? { workspace_scope: workspaceScope } : {}),
    });
    return request;
  };

  const forkChat = (
    sourceChatId: string,
    beforeUserIndex: number,
    title?: string,
    timeoutMs = 5_000,
  ): Promise<string> => {
    if (!options.isNetworkAvailable()) {
      return Promise.reject(new Error('network_unavailable'));
    }
    if (options.pending.hasNewChat()) {
      return Promise.reject(new Error('newChat already in flight'));
    }
    if (!sourceChatId.trim() || !Number.isInteger(beforeUserIndex) || beforeUserIndex < 0) {
      return Promise.reject(new Error('invalid fork position'));
    }
    const queueId = options.outbound.createId('fork-chat');
    const request = options.pending.createNewChat(
      timeoutMs,
      'fork timeout',
      () => options.outbound.remove(queueId),
    );
    options.queueSend(queueId, {
      type: 'fork_chat',
      source_chat_id: sourceChatId,
      before_user_index: beforeUserIndex,
      ...(title?.trim() ? { title: title.trim() } : {}),
    });
    return request;
  };

  const sendMessage = (
    chatId: string,
    content: string,
    media?: OutboundMedia[],
    sendOptions: SocketSendMessageOptions = {},
  ): MessageSendResult => {
    const turnId = createTurnId();
    const startsNewRun = sendOptions.startsNewRun !== false;
    const queueId = `message:${chatId}:${turnId}`;
    options.knownChats.add(chatId);

    // 先创建 accepted Promise，再检查网络和帧大小。这样调用方无论在哪种失败路径上，
    // 都能获得相同的 MessageSendResult 形状，并通过 accepted 统一处理拒绝原因。
    const result = options.pending.createMessageSend(
      chatId,
      turnId,
      startsNewRun,
      sendOptions.acceptanceTimeoutMs ?? MESSAGE_ACCEPT_TIMEOUT_MS,
      () => options.outbound.remove(queueId),
    );
    if (!options.isNetworkAvailable()) {
      options.pending.rejectMessage(chatId, turnId, new Error('network_unavailable'));
      return result;
    }
    const frame: OutboundFrame = {
      type: 'message',
      chat_id: chatId,
      content,
      ...(media?.length ? { media } : {}),
      ...(sendOptions.cliApps?.length ? { cli_apps: sendOptions.cliApps } : {}),
      ...(sendOptions.mcpPresets?.length ? { mcp_presets: sendOptions.mcpPresets } : {}),
      ...(sendOptions.quotedContext?.trim()
        ? { quoted_context: sendOptions.quotedContext.trim() }
        : {}),
      ...(sendOptions.workspaceScope ? { workspace_scope: sendOptions.workspaceScope } : {}),
      turn_id: turnId,
      webui: true,
    };
    if (!frameFitsTransport(frame, options.maxFrameBytes())) {
      options.pending.rejectMessage(chatId, turnId, new Error('transport_too_large'));
      return result;
    }
    options.queueSend(queueId, frame);
    return result;
  };

  const sendSystemCommand = (
    chatId: string,
    command: string,
    timeoutMs = 5_000,
  ): Promise<void> => {
    if (!options.isNetworkAvailable()) {
      return Promise.reject(new Error('network_unavailable'));
    }
    const turnId = `${SYSTEM_COMMAND_TURN_PREFIX}${createTurnId()}`;
    const queueId = `system:${turnId}`;
    options.knownChats.add(chatId);
    const request = options.pending.createSystemCommand(
      turnId,
      timeoutMs,
      () => options.outbound.remove(queueId),
    );
    options.queueSend(queueId, {
      type: 'message',
      chat_id: chatId,
      content: command.trim(),
      turn_id: turnId,
      webui: true,
    });
    return request;
  };

  const transcribeAudio = (
    dataUrl: string,
    transcriptionOptions?: { durationMs?: number; timeoutMs?: number },
  ): Promise<string> => {
    if (!options.isNetworkAvailable()) {
      return Promise.reject(new Error('network_unavailable'));
    }
    const requestId = createTurnId();
    const queueId = `transcription:${requestId}`;
    const request = options.pending.createTranscription(
      requestId,
      transcriptionOptions?.timeoutMs ?? 120_000,
      () => options.outbound.remove(queueId),
    );
    options.queueSend(queueId, {
      type: 'transcribe_audio',
      request_id: requestId,
      data_url: dataUrl,
      ...(transcriptionOptions?.durationMs !== undefined
        ? { duration_ms: transcriptionOptions.durationMs }
        : {}),
    });
    return request;
  };

  const setWorkspaceScope = (chatId: string, scope: WorkspaceScopePayload): void => {
    options.knownChats.add(chatId);
    if (!options.isNetworkAvailable()) return;
    options.queueSend(options.outbound.createId('workspace-scope'), {
      type: 'set_workspace_scope',
      chat_id: chatId,
      workspace_scope: scope,
    });
  };

  const stopTurn = (chatId: string): void => {
    // stop 是尽力而为的 UI 命令；连接层的失败会由状态恢复逻辑处理，不应制造未处理 Promise。
    void sendSystemCommand(chatId, '/stop', 5_000).catch(() => undefined);
  };

  return {
    attach,
    newChat,
    forkChat,
    sendMessage,
    sendSystemCommand,
    transcribeAudio,
    setWorkspaceScope,
    stopTurn,
  };
}
