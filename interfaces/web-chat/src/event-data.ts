import type {
  JobContext,
  JobProgressEvent,
  ToolActivityEvent,
} from "@brains/plugins";

interface WebChatProgressData {
  type: JobProgressEvent["type"];
  status: JobProgressEvent["status"];
  operationType: JobContext["operationType"];
  operationTarget?: string;
  message?: string;
  progress?: JobProgressEvent["progress"];
}

interface WebChatToolStatusData {
  status: "tool-invoking" | "tool-completed" | "tool-failed";
  toolName: string;
  message: string;
  error?: string;
}

export function toProgressData(event: JobProgressEvent): WebChatProgressData {
  const data: WebChatProgressData = {
    type: event.type,
    status: event.status,
    operationType: event.metadata.operationType,
  };
  if (event.metadata.operationTarget) {
    data.operationTarget = event.metadata.operationTarget;
  }
  if (event.message) {
    data.message = event.message;
  }
  if (event.progress) {
    data.progress = event.progress;
  }
  return data;
}

export function toToolStatusData(
  event: ToolActivityEvent,
): WebChatToolStatusData {
  const toolLabel = formatToolLabel(event.toolName);
  switch (event.type) {
    case "tool:invoking":
      return {
        status: "tool-invoking",
        toolName: event.toolName,
        message: `Using ${toolLabel}…`,
      };
    case "tool:completed":
      return {
        status: "tool-completed",
        toolName: event.toolName,
        message: `Finished ${toolLabel}.`,
      };
    case "tool:failed":
      return {
        status: "tool-failed",
        toolName: event.toolName,
        message: `${capitalize(toolLabel)} failed.`,
        ...(event.error !== undefined && { error: event.error }),
      };
  }
}

function formatToolLabel(toolName: string): string {
  if (toolName.startsWith("playbook_")) return "playbook";
  const withoutSystemPrefix = toolName.startsWith("system_")
    ? toolName.slice("system_".length)
    : toolName;
  return withoutSystemPrefix
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function capitalize(value: string): string {
  return value.length > 0
    ? `${value[0]?.toUpperCase()}${value.slice(1)}`
    : value;
}
