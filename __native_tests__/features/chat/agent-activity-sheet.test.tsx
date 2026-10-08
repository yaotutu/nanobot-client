import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('lucide-react-native/icons/activity', () => () => null);
jest.mock('lucide-react-native/icons/calendar-clock', () => () => null);
jest.mock('lucide-react-native/icons/circle-alert', () => () => null);
jest.mock('lucide-react-native/icons/file-clock', () => () => null);
jest.mock('lucide-react-native/icons/rotate-cw', () => () => null);
jest.mock('lucide-react-native/icons/x', () => () => null);
jest.mock('@/features/chat/api/session-automations', () => ({
  // 只保留会被面板调用的只读接口，具体返回值由每个用例前的 setup 决定。
  fetchSessionAutomations: jest.fn(),
}));

import { AgentActivitySheet } from '@/features/chat/components/modals/AgentActivitySheet';
import { fetchSessionAutomations } from '@/features/chat/api/session-automations';
import { normalizeActivityTimeline } from '@/features/chat/activity/model/activity-timeline';
import { chatPaletteForTheme } from '@/features/chat/ui/chat-theme';
import type { SessionAutomationJob } from '@/types/api/automations';
import type { UIMessage } from '@/types/api/chat/messages';

jest.mock('react-i18next', () => ({
  // AutomationsTab 需要读取 i18n 语言来格式化时间，这里返回稳定值即可。
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('@/features/chat/components/activity/ActivityMessage', () => {
  // Jest 的 mock factory 不允许访问外部变量，这里在实际模块内获取 Text。
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    ActivityMessage: ({ message }: { message: UIMessage }) => <MockText>{message.id}</MockText>,
  };
});

const mockJob: SessionAutomationJob = {
  id: 'job-1',
  name: '每日检查',
  enabled: true,
  schedule: { kind: 'every', every_ms: 86_400_000 },
  payload: { message: '检查今天的工作进展' },
  state: { next_run_at_ms: Date.now() + 3_600_000, last_status: 'ok' },
};

const units = normalizeActivityTimeline([
  { id: 'user', role: 'user' as const, content: '检查代码', createdAt: 1, kind: 'message' },
  {
    id: 'reasoning',
    role: 'assistant' as const,
    content: '',
    createdAt: 2,
    reasoning: '正在分析',
    reasoningStreaming: true,
    isStreaming: true,
  },
]);

async function renderSheet() {
  return render(
    <AgentActivitySheet
      cliApps={[]}
      colors={chatPaletteForTheme(false)}
      mcpPresets={[]}
      sessionKey="session-key"
      turnActive
      units={units}
      visible
      onClose={jest.fn()}
    />,
  );
}

describe('AgentActivitySheet', () => {
  beforeEach(() => {
    // clearMocks 会清空调用记录；这里补回固定返回值，保证两个用例互不影响。
    jest.mocked(fetchSessionAutomations).mockResolvedValue([mockJob]);
  });

  it('默认展示活动时间线，并可切换到文件和定时任务', async () => {
    const result = await renderSheet();

    expect(result.getByText('thread.agentActivity.summaryRunning')).toBeTruthy();
    expect(result.getByText('thread.agentActivity.userMessage')).toBeTruthy();
    expect(result.getByText('reasoning')).toBeTruthy();

    await fireEvent.press(result.getByRole('tab', { name: 'thread.agentActivity.tabs.files' }));
    expect(result.getByText('thread.agentActivity.emptyFiles')).toBeTruthy();
    expect(fetchSessionAutomations).not.toHaveBeenCalled();
  });

  it('定时任务只在对应 Tab 加载，并支持手动刷新', async () => {
    const result = await renderSheet();
    await fireEvent.press(result.getByRole('tab', { name: 'thread.agentActivity.tabs.automations' }));

    expect(await result.findByText('每日检查')).toBeTruthy();
    expect(result.getByText('检查今天的工作进展')).toBeTruthy();

    await fireEvent.press(result.getByRole('button', { name: 'thread.agentActivity.refresh' }));
    await waitFor(() => expect(fetchSessionAutomations).toHaveBeenCalledTimes(2));
  });
});
