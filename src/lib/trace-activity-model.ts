import i18n from "@/i18n";
import type { GenericToolStatus } from "@/lib/generic-tool-model";
import { safeActivityDetail, summarizeShellCommand } from "@/lib/activity-text";
import { presentWebSearchAction } from "@/lib/web-search-model";
import {
  displayWebHost,
  formatCompactWebUrl,
  parseSafeActivityHttpUrl,
} from "@/lib/web-url";

export interface TraceDescription {
  kind: "search" | "tool" | "done" | "trace";
  label: string;
  detail: string;
  icon?: "clock";
  url?: string;
  host?: string;
}

export function describeTraceLine(
  line: string,
  status: GenericToolStatus,
  result?: unknown,
): TraceDescription {
  const trimmed = line.trim();
  const functionMatch = /^([a-zA-Z0-9_.-]+)\((.*)\)$/.exec(trimmed);
  const name = (functionMatch?.[1] ?? "").toLowerCase().split(".").pop() || "";
  const args = functionMatch?.[2] ?? "";
  const parsedUrl = traceUrlFromArgs(args, trimmed);
  const webDetail = parsedUrl ? formatCompactWebUrl(parsedUrl) : "";
  const plainWebReadTrace =
    !!parsedUrl &&
    /\b(fetch(?:ing|ed)?|read(?:ing)?|opened?|opening)\b/i.test(trimmed);

  if (/search/i.test(name)) {
    const query =
      traceFieldFromArgs(args, ["query", "q", "text"]) || args || trimmed;
    return {
      kind: "search",
      label: presentWebSearchAction(
        query,
        status,
        name === "x_search" ? "x" : "web",
      ),
      detail: "",
    };
  }
  if (/fetch|read|open/i.test(name) || plainWebReadTrace) {
    const rawTarget =
      traceFieldFromArgs(args, ["path", "file_path", "url"]) || args || trimmed;
    const pageTitle = parsedUrl ? webPageTitle(result) : "";
    return {
      kind: "tool",
      label:
        pageTitle ||
        statusCopy(
          status,
          activityCopy("reading", "Reading"),
          activityCopy("read", "Read"),
          activityCopy("couldNotRead", "Could not read"),
        ),
      detail:
        webDetail ||
        (/^https?:\/\//i.test(rawTarget.trim())
          ? activityCopy("privateAddress", "private address")
          : safeActivityDetail(rawTarget)),
      url: parsedUrl?.href,
      host: parsedUrl ? displayWebHost(parsedUrl.hostname) : undefined,
    };
  }
  if (isShellTraceName(name)) return describeShellTrace(args, trimmed, status);
  if (name === "write_file") {
    return describeFileMutationTrace(
      args,
      status,
      activityCopy("writingFile", "Writing file"),
      activityCopy("wroteFile", "Wrote file"),
      activityCopy("couldNotWriteFile", "Could not write file"),
    );
  }
  if (name === "edit_file" || name === "apply_patch") {
    return describeFileMutationTrace(
      args,
      status,
      activityCopy("editingFile", "Editing file"),
      activityCopy("editedFile", "Edited file"),
      activityCopy("couldNotEditFile", "Could not edit file"),
    );
  }
  if (name) {
    const action = humanizeTraceToolName(name);
    return {
      kind: "tool",
      label: statusCopy(
        status,
        activityCopy("runningAction", "Running {{action}}", { action }),
        activityCopy("completedAction", "Completed {{action}}", { action }),
        activityCopy(
          "couldNotCompleteAction",
          "Could not complete {{action}}",
          { action },
        ),
      ),
      detail: "",
    };
  }
  if (/done|complete|success/i.test(trimmed)) {
    return {
      kind: "done",
      label: activityCopy("completedStep", "Completed step"),
      detail: safeActivityDetail(trimmed),
    };
  }
  return {
    kind: status === "done" ? "done" : "trace",
    label: statusCopy(
      status,
      activityCopy("working", "Working"),
      activityCopy("completedStep", "Completed step"),
      activityCopy("stepFailed", "Step failed"),
    ),
    detail: safeActivityDetail(trimmed),
  };
}

function activityCopy(
  key: string,
  defaultValue: string,
  values: Record<string, string | number> = {},
): string {
  return i18n.t(`message.activityDetail.${key}`, { defaultValue, ...values });
}

function webPageTitle(result: unknown): string {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const title = (result as Record<string, unknown>).title;
    if (typeof title === "string") return safeActivityDetail(title);
  }
  if (typeof result !== "string") return "";
  const heading = result.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading ? safeActivityDetail(heading) : "";
}

function describeShellTrace(
  args: string,
  fallback: string,
  status: GenericToolStatus,
): TraceDescription {
  const command = shellCommandFromArgs(args) || fallback;
  if (/^(?:\/(?:usr\/)?bin\/)?date(?:\s|$)/i.test(command.trim())) {
    return {
      kind: "tool",
      label: statusCopy(
        status,
        activityCopy("checkingCurrentTime", "Checking current time"),
        activityCopy("checkedCurrentTime", "Checked current time"),
        activityCopy(
          "couldNotCheckCurrentTime",
          "Could not check current time",
        ),
      ),
      detail: "",
      icon: "clock",
    };
  }
  return {
    kind: "tool",
    label: statusCopy(
      status,
      activityCopy("runningCommand", "Running command"),
      activityCopy("ranCommand", "Ran command"),
      activityCopy("commandFailed", "Command failed"),
    ),
    detail: summarizeShellCommand(command),
  };
}

function describeFileMutationTrace(
  args: string,
  status: GenericToolStatus,
  running: string,
  done: string,
  failed: string,
): TraceDescription {
  const path = traceFieldFromArgs(args, ["path", "file_path"]);
  return {
    kind: "tool",
    label: statusCopy(status, running, done, failed),
    detail: path ? safeActivityDetail(path) : "",
  };
}

function statusCopy(
  status: GenericToolStatus,
  running: string,
  done: string,
  failed: string,
): string {
  return status === "running" ? running : status === "error" ? failed : done;
}

function traceFieldFromArgs(args: string, keys: string[]): string {
  const compactArgs = args.trim();
  if (!compactArgs) return "";
  try {
    const parsed = JSON.parse(compactArgs) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return "";
    const record = parsed as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    return "";
  }
  return "";
}

function isShellTraceName(name: string): boolean {
  return [
    "exec",
    "exec_command",
    "execute_command",
    "run_command",
    "run_shell",
    "shell",
    "terminal",
    "bash",
    "sh",
  ].includes(name.toLowerCase().split(".").pop() || name.toLowerCase());
}

function shellCommandFromArgs(args: string): string {
  const compactArgs = args.trim();
  if (!compactArgs) return "";
  try {
    const parsed = JSON.parse(compactArgs) as unknown;
    if (typeof parsed === "string") return parsed;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return "";
    const record = parsed as Record<string, unknown>;
    for (const key of ["command", "cmd", "script", "input"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  } catch {
    return compactArgs.replace(/^["']|["']$/g, "");
  }
  return "";
}

function humanizeTraceToolName(name: string): string {
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

function traceUrlFromArgs(args: string, fallback: string): URL | null {
  const candidates: string[] = [];
  const compactArgs = args.trim();
  if (compactArgs) {
    try {
      collectUrlCandidates(JSON.parse(compactArgs), candidates);
    } catch {
      candidates.push(compactArgs.replace(/^["']|["']$/g, ""));
    }
  }
  candidates.push(fallback);
  for (const candidate of candidates) {
    const url = parseSafeActivityHttpUrl(candidate);
    if (url) return url;
    const embedded = candidate.match(/https?:\/\/[^\s"'<>),]+/i)?.[0];
    if (embedded) {
      const embeddedUrl = parseSafeActivityHttpUrl(embedded);
      if (embeddedUrl) return embeddedUrl;
    }
  }
  return null;
}

function collectUrlCandidates(value: unknown, candidates: string[]) {
  if (typeof value === "string") {
    candidates.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 6))
      collectUrlCandidates(item, candidates);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["url", "uri", "href", "link"]) {
    if (typeof record[key] === "string") candidates.push(record[key]);
  }
}
