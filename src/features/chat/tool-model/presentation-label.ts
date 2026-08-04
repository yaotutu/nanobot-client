/**
 * 将工具 family/name/status 映射为面向用户的活动文案。
 *
 * 该文件只决定“正在做什么”，字段脱敏、路径压缩和 i18n fallback 统一留给
 * presentation-format，避免新增工具时重复实现展示安全规则。
 */
import {
  activityCopy,
  fieldValue,
  humanizeToolName,
  statusCopy,
} from './presentation-format';
import type {
  GenericToolRunItem,
  GenericToolStatus,
  ToolFamily,
} from './types';

export function activityLabel(
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
