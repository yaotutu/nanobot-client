import type { TFunction } from 'i18next';

import type { SessionAutomationJob } from '@/types/api/automations';

import type { AutomationFilter, AutomationStatus } from './types';

export function isLocalTrigger(job: SessionAutomationJob | null): boolean {
  return Boolean(job && (job.kind === 'local_trigger' || job.payload.kind === 'local_trigger' || job.schedule.kind === 'local'));
}

export function automationTriggerCommand(job: SessionAutomationJob): string {
  return job.trigger?.command || job.payload.command || job.payload.message || '';
}

export function automationSummary(job: SessionAutomationJob, t: TFunction): string {
  if (isLocalTrigger(job)) return automationTriggerCommand(job) || t('settings.automations.localTrigger');
  return job.payload.message || t('settings.automations.systemTask');
}

export function automationNeedsAttention(job: SessionAutomationJob): boolean {
  return job.state.last_status === 'error';
}

export function automationStatusKey(job: SessionAutomationJob): AutomationStatus {
  if (job.protected) return 'system';
  if (job.state.pending) return 'running';
  if (!job.enabled) return 'paused';
  if (job.state.last_status === 'error') return 'failed';
  if (isLocalTrigger(job)) return 'active';
  if (job.delete_after_run && !job.state.next_run_at_ms && job.state.last_status === 'ok') return 'completed';
  if (!job.state.next_run_at_ms) return 'idle';
  return 'active';
}

export function automationStatus(job: SessionAutomationJob, t: TFunction): { label: string; tone: 'neutral' | 'success' | 'warning' } {
  const status = automationStatusKey(job);
  const key = status === 'idle' ? 'noSchedule' : status;
  const tone = status === 'active' ? 'success' : status === 'running' || status === 'failed' ? 'warning' : 'neutral';
  return { label: t(`settings.automations.status.${key}`), tone };
}

export function statusDotColor(job: SessionAutomationJob): string {
  const status = automationStatusKey(job);
  if (status === 'active' || status === 'running') return '#F18B43';
  if (status === 'failed') return '#D8A43B';
  return '#A5A39D';
}

export function matchesFilter(job: SessionAutomationJob, filter: AutomationFilter): boolean {
  const status = automationStatusKey(job);
  if (filter === 'active') return status === 'active' || status === 'running';
  if (filter === 'paused') return status === 'paused';
  if (filter === 'failed') return automationNeedsAttention(job);
  if (filter === 'system') return Boolean(job.protected);
  return true;
}

