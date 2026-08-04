import { debugLog } from '@/services/runtime/debug-log';

/**
 * 启动性能标记统一使用模块首次执行时的单调时钟作为原点。
 * `performance.now()` 不受系统时间校准影响，比 `Date.now()` 更适合比较同一次启动内的阶段耗时。
 */
const startupOrigin = globalThis.performance?.now?.() ?? Date.now();
const startupMarks = new Map<string, number>();

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function nativePerformanceMark(name: string): void {
  try {
    globalThis.performance?.mark?.(`nanobot:${name}`);
  } catch {
    // 部分旧版 Hermes 只实现了 performance.now；埋点失败不能影响应用启动。
  }
}

/**
 * 记录启动阶段的时间点，同时写入 release 构建可见的 DebugOverlay 日志。
 * 调用方应放在模块初始化、effect、异步任务边界或首帧 onLayout 中，避免在 render body 重复记录。
 */
export function markStartup(name: string): void {
  const timestamp = now();
  startupMarks.set(name, timestamp);
  nativePerformanceMark(name);
  debugLog('STARTUP', `${name} +${Math.round(timestamp - startupOrigin)}ms`);
}

/**
 * 计算两个启动标记之间的耗时。缺少任一标记时直接忽略，保证诊断代码永不阻塞业务流程。
 */
export function measureStartup(name: string, start: string, end: string): void {
  const startAt = startupMarks.get(start);
  const endAt = startupMarks.get(end);
  if (startAt === undefined || endAt === undefined) return;
  debugLog('STARTUP', `${name} ${Math.max(0, Math.round(endAt - startAt))}ms`);
}
