/** 定时任务最近一次运行记录；状态保持字符串联合，兼容服务端后续新增状态。 */
export interface AutomationRunHistoryEntry {
  run_at_ms: number;
  status: 'ok' | 'error' | 'skipped' | string;
  duration_ms?: number;
  error?: string | null;
}

/** 当前会话内只读展示用的定时任务。客户端不提供管理操作。 */
export interface SessionAutomationJob {
  id: string;
  name: string;
  enabled: boolean;
  protected?: boolean;
  delete_after_run?: boolean;
  created_at_ms?: number | null;
  updated_at_ms?: number | null;
  kind?: 'local_trigger' | 'cron' | string;
  schedule: {
    kind: 'at' | 'every' | 'cron' | 'local' | string;
    at_ms?: number | null;
    every_ms?: number | null;
    expr?: string | null;
    tz?: string | null;
  };
  payload: {
    message: string;
    kind?: 'agent_turn' | 'system_event' | 'local_trigger' | string;
    command?: string;
  };
  state: {
    next_run_at_ms?: number | null;
    last_run_at_ms?: number | null;
    last_status?: 'ok' | 'error' | 'skipped' | string | null;
    last_error?: string | null;
    pending?: boolean;
    run_history?: AutomationRunHistoryEntry[];
  };
  origin?: {
    session_key?: string;
    channel: string;
    chat_id?: string;
    title?: string;
    preview?: string;
  } | null;
  trigger?: {
    id: string;
    command: string;
  };
}

/** GET /api/sessions/{key}/automations 的响应体。 */
export interface AutomationsPayload {
  jobs: SessionAutomationJob[];
}
