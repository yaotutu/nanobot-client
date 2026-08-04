/**
 * 工具活动展示的共享格式化边界。
 *
 * 原始 trace 可能包含本机路径、长查询或内部标识；所有自由文本必须先在这里脱敏、压缩，
 * 然后才能由 label/detail 模块展示。i18n 默认值用于兼容尚未同步文案的网关工具。
 */
import i18n from '@/i18n';
import { compactActivityPath, redactActivityText } from '@/services/text/log-redaction';

import { isCollectedSourcePath } from './source-path';
import type {
  GenericToolRunItem,
  GenericToolStatus,
  GenericToolTrace,
  ToolField,
} from './types';

function compactGenericToolPath(value: string): string {
  const normalized = redactActivityText(value).replace(/\\/g, "/");
  if (isCollectedSourcePath(normalized)) {
    return truncateMiddle(
      normalized.split("/").pop() ||
        activityCopy("collectedSource", "collected source"),
      64,
    );
  }
  return compactActivityPath(normalized);
}

export function fieldValue(
  trace: GenericToolTrace | undefined,
  key: ToolField["key"],
): string {
  return trace?.fields.find((field) => field.key === key)?.value ?? "";
}

export function uniqueValues(
  items: GenericToolRunItem[],
  keys: ToolField["key"][],
): string[] {
  const values = items
    .flatMap((item) => item.trace.fields)
    .filter((field) => keys.includes(field.key))
    .map((field) => field.value);
  return [...new Set(values)];
}

export function statusCopy(
  status: GenericToolStatus,
  running: string,
  done: string,
  failed: string,
): string {
  return status === "running" ? running : status === "error" ? failed : done;
}

export function compactDetail(value: string): string {
  return value ? truncateMiddle(compactGenericToolPath(value), 88) : "";
}

export function safeText(value: string): string {
  return value
    ? truncateMiddle(redactActivityText(value).replace(/\s+/g, " ").trim(), 88)
    : "";
}

export function quote(value: string): string {
  const safe = safeText(value);
  return safe ? `“${safe}”` : "";
}

export function compactIdentifier(value: string): string {
  const safe = safeText(value);
  if (safe.length <= 16) return safe;
  return `${safe.slice(0, 7)}…${safe.slice(-5)}`;
}

export function humanizeToolName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return words
    ? `${words[0].toUpperCase()}${words.slice(1)}`
    : activityCopy("toolAction", "tool action");
}

export function activityCopy(
  key: string,
  defaultValue: string,
  values: Record<string, string | number> = {},
): string {
  return i18n.t(`message.activityDetail.${key}`, { defaultValue, ...values });
}


function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const head = Math.ceil((maxLength - 1) * 0.62);
  const tail = Math.floor((maxLength - 1) * 0.38);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
