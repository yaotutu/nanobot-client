import { describe, expect, it } from 'vitest';

import { normalizeActivityTimeline } from '@/features/chat/activity/model/activity-timeline';
import {
  deriveAgentActivityPanel,
  deriveHeaderActivity,
} from '@/features/chat/activity/model/header-activity';
import type { UIMessage } from '@/types/api/chat/messages';

const userMessage = (createdAt: number, content = '检查代码'): UIMessage => ({
  id: 'user',
  role: 'user',
  content,
  createdAt,
  kind: 'message',
});

describe('header activity model', () => {
  it('空闲时不显示完成态，历史会话进入应用仍保持会话导航', () => {
    const units = normalizeActivityTimeline([
      userMessage(1),
      reasoningMessage(2, false),
    ]);

    expect(deriveHeaderActivity(units, false, { nowMs: 100_000 })).toMatchObject({
      phase: 'idle',
      reasoningStepCount: 1,
    });
  });

  it('推理流式输出时显示思考状态，并保留活动统计', () => {
    const units = normalizeActivityTimeline([
      userMessage(1),
      reasoningMessage(20, true),
    ]);

    expect(deriveHeaderActivity(units, true, { nowMs: 2_000 })).toMatchObject({
      phase: 'thinking',
      elapsedMs: 1_999,
      reasoningStepCount: 1,
    });
  });

  it('工具事件运行时显示工具状态', () => {
    const units = normalizeActivityTimeline([
      userMessage(1),
      {
        id: 'tool',
        role: 'assistant',
        content: '',
        kind: 'trace',
        createdAt: 2,
        isStreaming: true,
        toolEvents: [{
          call_id: 'call-1',
          name: 'search',
          phase: 'start',
          arguments: '{}',
        }],
        traces: ['search({})'],
      },
    ]);

    expect(deriveHeaderActivity(units, true, { nowMs: 1_000 })).toMatchObject({
      phase: 'tool',
      toolCallCount: 1,
    });
  });

  it('文件编辑运行时显示文件状态', () => {
    const units = normalizeActivityTimeline([
      userMessage(1),
      {
        id: 'file',
        role: 'assistant',
        content: '',
        kind: 'trace',
        createdAt: 2,
        isStreaming: true,
        fileEdits: [{
          call_id: 'call-file',
          tool: 'write_file',
          path: 'src/App.tsx',
          phase: 'start',
          added: 1,
          deleted: 0,
          status: 'editing',
        }],
      },
    ]);

    expect(deriveHeaderActivity(units, true, { nowMs: 1_000 })).toMatchObject({
      phase: 'file',
      fileEditCount: 1,
    });
  });

  it('回复正文流式输出时优先显示生成回复', () => {
    const units = normalizeActivityTimeline([
      userMessage(1),
      reasoningMessage(2, false),
      {
        id: 'answer',
        role: 'assistant',
        content: '答案',
        kind: 'message',
        createdAt: 3,
        isStreaming: true,
      },
    ]);

    expect(deriveHeaderActivity(units, true, { nowMs: 1_000 }).phase).toBe('replying');
  });

  it('turnActive 的完成边沿短暂显示已完成状态', () => {
    const units = normalizeActivityTimeline([
      userMessage(1),
      reasoningMessage(2, false),
    ]);

    expect(deriveHeaderActivity(units, false, {
      nowMs: 3_000,
      completedAtMs: 2_000,
    })).toMatchObject({
      phase: 'done',
      durationMs: 1_999,
      reasoningStepCount: 1,
    });
  });

  it('二级面板只统计最后一个用户回合并保留用户消息', () => {
    const firstUser = { ...userMessage(1, '旧问题'), id: 'old-user' };
    const latestUser = { ...userMessage(10, '新问题'), id: 'new-user' };
    const units = normalizeActivityTimeline([
      firstUser,
      { id: 'old-answer', role: 'assistant' as const, content: '旧答案', kind: 'message', createdAt: 2 },
      latestUser,
      reasoningMessage(11, false),
    ]);

    expect(deriveAgentActivityPanel(units, false)).toMatchObject({
      userPrompt: '新问题',
      startedAtMs: 10,
      reasoningStepCount: 1,
    });
  });
});

function reasoningMessage(createdAt: number, streaming: boolean): UIMessage {
  return {
    id: `reasoning-${createdAt}`,
    role: 'assistant',
    content: '',
    kind: 'message',
    createdAt,
    reasoning: streaming ? '正在分析' : '分析完成',
    reasoningStreaming: streaming,
    isStreaming: streaming,
  };
}
