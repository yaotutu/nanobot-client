import { isModelCommandResponseText, isModelCommandText } from '@/services/text/format';
import { isSystemCommandTurnId } from '@/features/connection';
import type { UIMessage } from '@/types/api/chat/messages';

/**
 * 助手消息的创建时间是首段输出时间，而 latency 覆盖整轮请求。
 * 没有显式完成时间时，从对应用户消息的开始时间推导，避免重复计算首段输出前的等待。
 */
function deriveAssistantCompletionTimes(messages: UIMessage[]): UIMessage[] {
  const userStartedAtByTurn = new Map<string, number>();
  let latestUserStartedAt: number | undefined;

  return messages.map((message) => {
    if (message.role === 'user') {
      if (Number.isFinite(message.createdAt)) {
        latestUserStartedAt = message.createdAt;
        if (message.turnId) userStartedAtByTurn.set(message.turnId, message.createdAt);
      }
      return message;
    }
    if (
      message.role !== 'assistant'
      || message.kind === 'trace'
      || message.completedAt !== undefined
      || message.latencyMs === undefined
      || !Number.isFinite(message.latencyMs)
      || message.latencyMs < 0
    ) return message;

    const startedAt = message.turnId
      ? userStartedAtByTurn.get(message.turnId)
      : message.source
        ? undefined
        : latestUserStartedAt;
    if (startedAt === undefined) return message;
    return { ...message, completedAt: startedAt + message.latencyMs };
  });
}

/**
 * 历史加载、规范快照刷新和实时 WebSocket 更新共用同一显示投影。
 * 模型切换命令属于控制消息，不进入聊天列表；完成时间也在这里统一处理。
 */
export function projectWebuiThreadMessages(messages: UIMessage[]): UIMessage[] {
  const hiddenTurns = new Set(
    messages.flatMap((message) => (
      message.role === 'user'
      && isModelCommandText(message.content)
      && message.turnId
        ? [message.turnId]
        : []
    )),
  );
  const visible = messages.filter((message) => (
    !isSystemCommandTurnId(message.turnId)
    && (!message.turnId || !hiddenTurns.has(message.turnId))
    && !(message.role === 'user' && isModelCommandText(message.content))
    && !(message.role === 'assistant' && isModelCommandResponseText(message.content))
  ));
  return deriveAssistantCompletionTimes(visible);
}
