import type {
  JobContext,
  JobProgressEvent,
  ToolStatusUpdate,
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
  status:
    | "tool-running"
    | "tool-completed"
    | "tool-awaiting-approval"
    | "tool-failed";
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
  update: ToolStatusUpdate,
): WebChatToolStatusData {
  const toolLabel = formatToolLabel(update.toolName);
  switch (update.state) {
    case "running":
      return {
        status: "tool-running",
        toolName: update.toolName,
        message: `Using ${toolLabel}…`,
      };
    case "completed":
      return {
        status: "tool-completed",
        toolName: update.toolName,
        message: `Finished ${toolLabel}.`,
      };
    case "awaiting-approval":
      return {
        status: "tool-awaiting-approval",
        toolName: update.toolName,
        message: `${capitalize(toolLabel)} is awaiting approval.`,
      };
    case "failed":
      return {
        status: "tool-failed",
        toolName: update.toolName,
        message: `${capitalize(toolLabel)} failed.`,
        ...(update.error !== undefined && { error: update.error }),
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
