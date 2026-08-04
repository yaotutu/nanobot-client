/**
 * 工具活动展示模型的稳定入口。
 *
 * 聚合状态、文案标签、详情和批量摘要分别由小模块计算；调用方只依赖
 * describeGenericToolRun，避免 UI 组件了解不同工具协议字段的兼容规则。
 */
import { activityAside, activityDetail } from './presentation-detail';
import { activityLabel } from './presentation-label';
import type {
  GenericToolPresentation,
  GenericToolRunItem,
  GenericToolStatus,
} from './types';

export function describeGenericToolRun(
  items: GenericToolRunItem[],
): GenericToolPresentation {
  const status = aggregateStatus(items);
  const family = items[0]?.trace.family ?? 'generic';
  const name = items[0]?.trace.name ?? 'tool';
  const collected =
    items.length > 0 && items.every((item) => item.trace.collectedSource);
  return {
    status,
    label: activityLabel(family, status, collected, name, items),
    detail: activityDetail(items, family, name),
    aside: activityAside(items, family),
  };
}

function aggregateStatus(items: GenericToolRunItem[]): GenericToolStatus {
  if (items.some((item) => item.status === 'error')) return 'error';
  if (items.some((item) => item.status === 'running')) return 'running';
  return 'done';
}
