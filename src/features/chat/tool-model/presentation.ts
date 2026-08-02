import i18n from '@/i18n';
import { compactActivityPath, redactActivityText } from '@/services/text/log-redaction';

import { isCollectedSourcePath } from './source-path';
import type {
  GenericToolPresentation,
  GenericToolRunItem,
  GenericToolStatus,
  GenericToolTrace,
  ToolFamily,
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

export function describeGenericToolRun(
  items: GenericToolRunItem[],
): GenericToolPresentation {
  const status = aggregateStatus(items);
  const family = items[0]?.trace.family ?? "generic";
  const name = items[0]?.trace.name ?? "tool";
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
  if (items.some((item) => item.status === "error")) return "error";
  if (items.some((item) => item.status === "running")) return "running";
  return "done";
}

function activityLabel(
  family: ToolFamily,
  status: GenericToolStatus,
  collected: boolean,
  name: string,
  items: GenericToolRunItem[],
): string {
  if (family === "content-search") {
    return statusCopy(
      status,
      collected
        ? activityCopy("viewingSource", "Viewing source")
        : activityCopy("searchingFiles", "Searching files"),
      collected
        ? activityCopy("viewedSource", "Viewed source")
        : activityCopy("searchedFiles", "Searched files"),
      collected
        ? activityCopy("couldNotViewSource", "Could not view source")
        : activityCopy("couldNotSearchFiles", "Could not search files"),
    );
  }
  if (family === "file-search") {
    return statusCopy(
      status,
      activityCopy("findingFiles", "Finding files"),
      activityCopy("foundFiles", "Found files"),
      activityCopy("couldNotFindFiles", "Could not find files"),
    );
  }
  if (family === "list") {
    return statusCopy(
      status,
      activityCopy("listingFiles", "Listing files"),
      activityCopy("listedFiles", "Listed files"),
      activityCopy("couldNotListFiles", "Could not list files"),
    );
  }
  if (family === "read") {
    return statusCopy(
      status,
      collected
        ? activityCopy("readingSource", "Reading source")
        : activityCopy("readingFiles", "Reading files"),
      collected
        ? activityCopy("readSource", "Read source")
        : activityCopy("readFiles", "Read files"),
      collected
        ? activityCopy("couldNotReadSource", "Could not read source")
        : activityCopy("couldNotReadFiles", "Could not read files"),
    );
  }
  if (family === "memory") {
    return statusCopy(
      status,
      activityCopy("searchingMemory", "Searching memory"),
      activityCopy("searchedMemory", "Searched memory"),
      activityCopy("couldNotSearchMemory", "Could not search memory"),
    );
  }

  const action = fieldValue(items[0]?.trace, "action").toLowerCase();
  switch (name) {
    case "generate_image":
      return statusCopy(
        status,
        activityCopy("generatingImage", "Generating image"),
        activityCopy("generatedImage", "Generated image"),
        activityCopy("couldNotGenerateImage", "Could not generate image"),
      );
    case "spawn":
      return statusCopy(
        status,
        activityCopy("delegatingTask", "Delegating task"),
        activityCopy("delegatedTask", "Delegated task"),
        activityCopy("couldNotDelegateTask", "Could not delegate task"),
      );
    case "message":
      return statusCopy(
        status,
        activityCopy("sendingMessage", "Sending message"),
        activityCopy("sentMessage", "Sent message"),
        activityCopy("couldNotSendMessage", "Could not send message"),
      );
    case "my":
      return action === "set" || action === "modify"
        ? statusCopy(
            status,
            activityCopy("updatingAgentSettings", "Updating agent settings"),
            activityCopy("updatedAgentSettings", "Updated agent settings"),
            activityCopy(
              "couldNotUpdateAgentSettings",
              "Could not update agent settings",
            ),
          )
        : statusCopy(
            status,
            activityCopy("checkingAgentSettings", "Checking agent settings"),
            activityCopy("checkedAgentSettings", "Checked agent settings"),
            activityCopy(
              "couldNotCheckAgentSettings",
              "Could not check agent settings",
            ),
          );
    case "cron":
      if (action === "add") {
        return statusCopy(
          status,
          activityCopy("creatingAutomation", "Creating automation"),
          activityCopy("createdAutomation", "Created automation"),
          activityCopy(
            "couldNotCreateAutomation",
            "Could not create automation",
          ),
        );
      }
      if (action === "remove") {
        return statusCopy(
          status,
          activityCopy("removingAutomation", "Removing automation"),
          activityCopy("removedAutomation", "Removed automation"),
          activityCopy(
            "couldNotRemoveAutomation",
            "Could not remove automation",
          ),
        );
      }
      return statusCopy(
        status,
        activityCopy("checkingAutomations", "Checking automations"),
        activityCopy("checkedAutomations", "Checked automations"),
        activityCopy("couldNotCheckAutomations", "Could not check automations"),
      );
    case "create_goal":
      return statusCopy(
        status,
        activityCopy("creatingGoal", "Creating long-term goal"),
        activityCopy("createdGoal", "Created long-term goal"),
        activityCopy("couldNotCreateGoal", "Could not create long-term goal"),
      );
    case "update_goal":
      return statusCopy(
        status,
        activityCopy("updatingGoal", "Updating long-term goal"),
        activityCopy("updatedGoal", "Updated long-term goal"),
        activityCopy("couldNotUpdateGoal", "Could not update long-term goal"),
      );
    case "write_stdin":
      return statusCopy(
        status,
        activityCopy("continuingCommand", "Continuing command"),
        activityCopy("continuedCommand", "Continued command"),
        activityCopy("couldNotContinueCommand", "Could not continue command"),
      );
    case "list_exec_sessions":
      return statusCopy(
        status,
        activityCopy("checkingRunningCommands", "Checking running commands"),
        activityCopy("checkedRunningCommands", "Checked running commands"),
        activityCopy(
          "couldNotCheckRunningCommands",
          "Could not check running commands",
        ),
      );
    case "screenshot":
    case "capture_screenshot":
      return statusCopy(
        status,
        activityCopy("takingScreenshot", "Taking screenshot"),
        activityCopy("tookScreenshot", "Took screenshot"),
        activityCopy("couldNotTakeScreenshot", "Could not take screenshot"),
      );
    default: {
      const humanName = humanizeToolName(name);
      return statusCopy(
        status,
        activityCopy("runningAction", "Running {{action}}", {
          action: humanName,
        }),
        activityCopy("completedAction", "Completed {{action}}", {
          action: humanName,
        }),
        activityCopy(
          "couldNotCompleteAction",
          "Could not complete {{action}}",
          { action: humanName },
        ),
      );
    }
  }
}

function activityDetail(
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

function activityAside(
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

function fieldValue(
  trace: GenericToolTrace | undefined,
  key: ToolField["key"],
): string {
  return trace?.fields.find((field) => field.key === key)?.value ?? "";
}

function uniqueValues(
  items: GenericToolRunItem[],
  keys: ToolField["key"][],
): string[] {
  const values = items
    .flatMap((item) => item.trace.fields)
    .filter((field) => keys.includes(field.key))
    .map((field) => field.value);
  return [...new Set(values)];
}

function statusCopy(
  status: GenericToolStatus,
  running: string,
  done: string,
  failed: string,
): string {
  return status === "running" ? running : status === "error" ? failed : done;
}

function compactDetail(value: string): string {
  return value ? truncateMiddle(compactGenericToolPath(value), 88) : "";
}

function safeText(value: string): string {
  return value
    ? truncateMiddle(redactActivityText(value).replace(/\s+/g, " ").trim(), 88)
    : "";
}

function quote(value: string): string {
  const safe = safeText(value);
  return safe ? `“${safe}”` : "";
}

function compactIdentifier(value: string): string {
  const safe = safeText(value);
  if (safe.length <= 16) return safe;
  return `${safe.slice(0, 7)}…${safe.slice(-5)}`;
}

function humanizeToolName(name: string): string {
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

function activityCopy(
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
