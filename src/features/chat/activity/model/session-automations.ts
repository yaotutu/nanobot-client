import type { TFunction } from 'i18next';

import {
  formatDateTime,
  relativeTimeFromMs,
  safeNumberFormat,
} from '@/services/text/format';
import type { SessionAutomationJob } from '@/types/api/automations';

/** 判断是否为本地触发器；不同字段的语义相同，三处都用于兼容服务端数据。 */
export function isSessionLocalTrigger(job: SessionAutomationJob): boolean {
  return Boolean(
    job.kind === 'local_trigger'
    || job.payload.kind === 'local_trigger'
    || job.schedule.kind === 'local',
  );
}

/** 将服务端 schedule 结构转成一行用户可读文本。 */
export function formatSessionSchedule(
  job: SessionAutomationJob,
  t: TFunction,
  locale: string,
): string {
  if (isSessionLocalTrigger(job)) return t('thread.sessionInfo.schedule.local');
  if (job.schedule.kind === 'at' && job.schedule.at_ms) {
    return t('thread.sessionInfo.schedule.at', {
      time: formatDateTime(job.schedule.at_ms, locale),
    });
  }
  if (job.schedule.kind === 'every' && job.schedule.every_ms) {
    return t('thread.sessionInfo.schedule.every', {
      duration: formatSessionScheduleDuration(job.schedule.every_ms, locale),
    });
  }
  if (job.schedule.kind === 'cron' && job.schedule.expr) {
    return job.schedule.tz
      ? t('thread.sessionInfo.schedule.cronWithTz', {
        expr: job.schedule.expr,
        tz: job.schedule.tz,
      })
      : t('thread.sessionInfo.schedule.cron', { expr: job.schedule.expr });
  }
  return t('thread.sessionInfo.schedule.unknown');
}

/** 将下次运行时间转成用户可读文本。 */
export function formatSessionNextRun(
  job: SessionAutomationJob,
  t: TFunction,
  locale: string,
): string {
  if (!job.enabled) return t('thread.sessionInfo.next.disabled');
  if (job.state.pending) return t('thread.sessionInfo.next.pending');
  if (isSessionLocalTrigger(job)) return t('thread.sessionInfo.next.local');
  const next = job.state.next_run_at_ms;
  if (!next) return t('thread.sessionInfo.next.none');
  return t('thread.sessionInfo.next.label', {
    time: relativeTimeFromMs(next, undefined, locale),
  });
}

/** 周期任务优先显示整单位，其余显示分钟，避免出现毫秒噪声。 */
function formatSessionScheduleDuration(ms: number, locale: string): string {
  const units: Array<[Intl.NumberFormatOptions['unit'], number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
  ];
  const matched = units.find(([, size]) => ms >= size && ms % size === 0);
  if (matched) {
    const [unit, size] = matched;
    return safeNumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'long',
    }).format(ms / size);
  }
  return safeNumberFormat(locale, {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'long',
    maximumFractionDigits: 1,
  }).format(ms / 60_000);
}
