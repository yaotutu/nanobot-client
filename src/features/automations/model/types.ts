export type AutomationFilter = 'all' | 'active' | 'paused' | 'failed' | 'system';
export type AutomationSort = 'next' | 'last' | 'updated' | 'name';
export type AutomationAction = 'enable' | 'disable' | 'delete' | 'run';
export type AutomationStatus = 'active' | 'running' | 'paused' | 'failed' | 'system' | 'completed' | 'idle';
export type EveryUnit = 'second' | 'minute' | 'hour' | 'day';
export type ScheduleKind = 'at' | 'every' | 'cron';

export interface SearchToken {
  field: 'id' | 'name' | 'message' | 'chat' | 'cron' | 'schedule' | 'status' | null;
  value: string;
}

export interface EditDraft {
  name: string;
  message: string;
  scheduleKind: ScheduleKind;
  everyValue: string;
  everyUnit: EveryUnit;
  cronExpr: string;
  tz: string;
  atDate: Date;
}

export const FILTERS: AutomationFilter[] = ['all', 'active', 'paused', 'failed', 'system'];
export const SORTS: AutomationSort[] = ['next', 'last', 'updated', 'name'];
export const EVERY_UNITS: Array<{ key: EveryUnit; ms: number }> = [
  { key: 'second', ms: 1_000 },
  { key: 'minute', ms: 60_000 },
  { key: 'hour', ms: 3_600_000 },
  { key: 'day', ms: 86_400_000 },
];
