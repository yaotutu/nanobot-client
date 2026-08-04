/**
 * 生成工具活动行的单项详情和批量摘要。
 *
 * detail 只在单项运行时展示具体目标；aside 用于多项运行计数。两者均复用格式化模块，
 * 确保路径、查询和会话标识在进入 UI 前已经压缩和脱敏。
 */
import {
  activityCopy,
  compactDetail,
  compactIdentifier,
  fieldValue,
  quote,
  safeText,
  uniqueValues,
} from './presentation-format';
import type { GenericToolRunItem, ToolFamily } from './types';

export function activityDetail(
  items: GenericToolRunItem[],
  family: ToolFamily,
  name: string,
): string {
  if (items.length !== 1) return "";
  const trace = items[0].trace;
  if (family === "content-search") {
    return quote(fieldValue(trace, "query") || fieldValue(trace, "pattern"));
  }
  if (family === "file-search") {
    return compactDetail(
      fieldValue(trace, "glob") ||
        fieldValue(trace, "query") ||
        fieldValue(trace, "pattern") ||
        fieldValue(trace, "path"),
    );
  }
  if (family === "list" || family === "read") {
    return compactDetail(
      fieldValue(trace, "path") || fieldValue(trace, "file_path"),
    );
  }
  if (family === "memory") return quote(fieldValue(trace, "query"));

  switch (name) {
    case "spawn":
      return safeText(fieldValue(trace, "label"));
    case "message":
      return safeText(fieldValue(trace, "channel"));
    case "my":
      return safeText(fieldValue(trace, "key"));
    case "cron":
      return safeText(fieldValue(trace, "name"));
    case "create_goal":
      return safeText(fieldValue(trace, "ui_summary"));
    case "update_goal":
      return safeText(fieldValue(trace, "action"));
    case "write_stdin":
      return compactIdentifier(fieldValue(trace, "session_id"));
    case "screenshot":
    case "capture_screenshot":
      return "";
    default:
      return "";
  }
}

export function activityAside(
  items: GenericToolRunItem[],
  family: ToolFamily,
): string {
  const pathCount = uniqueValues(items, ["path", "file_path"]).length;
  if (pathCount > 1) {
    return activityCopy("fileCount", "{{count}} files", { count: pathCount });
  }
  if (items.length <= 1) return "";
  if (
    family === "content-search" ||
    family === "file-search" ||
    family === "memory"
  ) {
    return activityCopy("searchCount", "{{count}} searches", {
      count: items.length,
    });
  }
  return activityCopy("operationCount", "{{count}} actions", {
    count: items.length,
  });
}
