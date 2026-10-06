import { createStreamFoldState, finalizeStreamedTurn, foldStreamEvent, prepareStreamFoldForUserTurn } from '@/features/chat/stream-fold';
import { toMediaAttachment } from '@/services/links/media';
import type { UIMessage } from '@/types/api/chat/messages';
import type { WebuiThreadPersistedPayload } from '@/types/api/chat/thread';
import { turnFields } from '../stream-fold/state';
import { projectWebuiThreadMessages } from './thread-messages';

/** 领域快照与线上协议分开：页面只消费消息，HTTP 边界只接收 schema 3 的 events。 */
export type ChatThreadSnapshot = Omit<WebuiThreadPersistedPayload, 'events' | 'fork_boundary_event_index'> & {
  messages: UIMessage[];
  forkBoundaryMessageCount: number | null;
};

/**
 * 顺序回放服务端事件，复用实时流的工具、推理和答案折叠规则。
 * 服务端 projection_id 保证重复加载/分页时消息身份稳定，不再读取旧的 messages 快照。
 * fork 边界先记录身份，再按最终可见消息计数，避免模型命令与活动归并导致位置偏移。
 */
export function projectThreadEvents(payload: WebuiThreadPersistedPayload): ChatThreadSnapshot {
  const state = createStreamFoldState();
  let messages: UIMessage[] = [];
  let boundaryIds: Set<string> | null = null;
  let eventTime = 0;
  payload.events.forEach((event, index) => {
    if (index === payload.fork_boundary_event_index) boundaryIds = new Set(messages.map((message) => message.id));
    eventTime = event.created_at_ms ?? eventTime;
    state.persistedEvent = { id: event.projection_id, createdAt: eventTime };
    if (event.event === 'user_message') {
      if (event.starts_turn !== false) {
        messages = finalizeStreamedTurn(messages);
        prepareStreamFoldForUserTurn(state);
      }
      const media = event.media_urls?.map(toMediaAttachment);
      messages = [...messages, {
        id: 'user-' + event.projection_id,
        role: 'user',
        content: event.text,
        createdAt: eventTime,
        ...turnFields(event, 'user'),
        ...(media?.length ? { media } : {}),
        ...(event.cli_apps?.length ? { cliApps: event.cli_apps } : {}),
        ...(event.mcp_presets?.length ? { mcpPresets: event.mcp_presets } : {}),
      }];
      return;
    }
    messages = foldStreamEvent(messages, { ...event, created_at_ms: eventTime }, state);
  });
  if (payload.fork_boundary_event_index === payload.events.length) boundaryIds = new Set(messages.map((message) => message.id));
  // 无正在运行的 turn 时，历史文本不能呈现为仍在生成；工具状态仍由服务端的活动字段决定。
  if (!payload.active_turn_id) messages = finalizeStreamedTurn(messages);
  const visible = projectWebuiThreadMessages(messages);
  return {
    schemaVersion: payload.schemaVersion,
    projection: payload.projection,
    sessionKey: payload.sessionKey,
    completed_turn_ids: payload.completed_turn_ids,
    active_turn_id: payload.active_turn_id,
    has_pending_tool_calls: payload.has_pending_tool_calls,
    page: payload.page,
    workspace_scope: payload.workspace_scope,
    messages: visible,
    forkBoundaryMessageCount: boundaryIds === null ? null : visible.filter((message) => boundaryIds?.has(message.id)).length,
  };
}
