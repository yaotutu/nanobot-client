import i18n from "@/i18n";
import { safeActivityDetail } from "@/services/text/log-redaction";
import { formatCompactWebUrl, parseSafeActivityHttpUrl } from "@/services/links/web-url";

export type McpActivityStatus = "running" | "done" | "error";

export interface McpActivityDescription {
  action: string;
  target?: string;
}

export function describeMcpActivity(
  toolName: string,
  args: unknown,
  status: McpActivityStatus,
): McpActivityDescription {
  const name = toolName.toLowerCase();

  if (matches(name, "navigate", "goto", "open_url", "visit")) {
    return describe(
      status,
      activityCopy("opening", "Opening"),
      activityCopy("opened", "Opened"),
      activityCopy("couldNotOpen", "Could not open"),
      value(args, ["url"]),
    );
  }
  if (matches(name, "click", "tap")) {
    return describe(
      status,
      activityCopy("clicking", "Clicking"),
      activityCopy("clicked", "Clicked"),
      activityCopy("couldNotClick", "Could not click"),
      elementTarget(args),
    );
  }
  if (matches(name, "type", "fill", "enter_text", "insert_text")) {
    const target = value(args, ["element", "selector", "ref", "name"]);
    return describe(
      status,
      activityCopy("enteringText", "Entering text"),
      activityCopy("enteredText", "Entered text"),
      activityCopy("couldNotEnterText", "Could not enter text"),
      target
        ? activityCopy("inTarget", "in {{target}}", { target })
        : undefined,
    );
  }
  if (matches(name, "press_key", "keypress")) {
    return describe(
      status,
      activityCopy("pressingKey", "Pressing key"),
      activityCopy("pressedKey", "Pressed key"),
      activityCopy("couldNotPressKey", "Could not press key"),
      value(args, ["key"]),
    );
  }
  if (matches(name, "hover")) {
    return describe(
      status,
      activityCopy("hovering", "Hovering over"),
      activityCopy("hovered", "Hovered over"),
      activityCopy("couldNotHover", "Could not hover over"),
      elementTarget(args),
    );
  }
  if (matches(name, "select", "select_option")) {
    return describe(
      status,
      activityCopy("selecting", "Selecting"),
      activityCopy("selected", "Selected"),
      activityCopy("couldNotSelect", "Could not select"),
      elementTarget(args),
    );
  }
  if (
    matches(name, "snapshot", "inspect", "get_page_content", "page_content")
  ) {
    return describe(
      status,
      activityCopy("inspectingPage", "Inspecting page"),
      activityCopy("inspectedPage", "Inspected page"),
      activityCopy("couldNotInspectPage", "Could not inspect page"),
    );
  }
  if (matches(name, "screenshot", "capture_screenshot")) {
    return describe(
      status,
      activityCopy("takingScreenshot", "Taking screenshot"),
      activityCopy("tookScreenshot", "Took screenshot"),
      activityCopy("couldNotTakeScreenshot", "Could not take screenshot"),
    );
  }
  if (matches(name, "wait", "wait_for")) {
    return describe(
      status,
      activityCopy("waitingForPage", "Waiting for page"),
      activityCopy("waitedForPage", "Waited for page"),
      activityCopy("pageNotReady", "Page was not ready"),
    );
  }
  if (matches(name, "search", "web_search")) {
    return describe(
      status,
      activityCopy("searching", "Searching"),
      activityCopy("searched", "Searched"),
      activityCopy("couldNotSearch", "Could not search"),
      value(args, ["query", "q"]),
    );
  }

  const action = humanizeToolName(toolName);
  if (status === "running") {
    return {
      action: activityCopy("runningAction", "Running {{action}}", { action }),
    };
  }
  if (status === "error") {
    return {
      action: activityCopy("actionFailed", "{{action}} failed", { action }),
    };
  }
  return {
    action: activityCopy("completedAction", "Completed {{action}}", { action }),
  };
}

function activityCopy(
  key: string,
  defaultValue: string,
  values: Record<string, string | number> = {},
): string {
  return i18n.t(`message.activityDetail.${key}`, { defaultValue, ...values });
}

function describe(
  status: McpActivityStatus,
  running: string,
  done: string,
  failed: string,
  target?: string,
): McpActivityDescription {
  return {
    action: status === "running" ? running : status === "error" ? failed : done,
    target: target ? compactUrl(target) : undefined,
  };
}

function matches(name: string, ...actions: string[]): boolean {
  return actions.some(
    (action) => name === action || name.endsWith(`_${action}`),
  );
}

function elementTarget(args: unknown): string | undefined {
  return value(args, ["element", "selector", "ref", "name", "text"]);
}

function value(args: unknown, keys: string[]): string | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args))
    return undefined;
  const record = args as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
    if (typeof candidate === "number" || typeof candidate === "boolean")
      return String(candidate);
  }
  return undefined;
}

function compactUrl(value: string): string {
  const url = parseSafeActivityHttpUrl(value);
  if (url) return formatCompactWebUrl(url);
  if (/^https?:\/\//i.test(value.trim())) {
    return activityCopy("privateAddress", "private address");
  }
  return safeActivityDetail(value, 80);
}

function humanizeToolName(value: string): string {
  const words = value
    .replace(/^(?:browser|page|playwright)[_.-]+/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return words
    ? `${words[0].toUpperCase()}${words.slice(1)}`
    : activityCopy("toolCall", "tool call");
}
