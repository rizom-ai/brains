import {
  formatMessageProgressDisplay,
  getToolStatusDisplay,
  type JobContext,
  type JobProgressEvent,
  type ToolStatusUpdate,
} from "@brains/plugins";

interface WebChatProgressData {
  type: JobProgressEvent["type"];
  status: JobProgressEvent["status"];
  operationType: JobContext["operationType"];
  operationTarget?: string;
  message?: string;
  progress?: JobProgressEvent["progress"];
  title?: string;
  label?: string;
  amount?: string;
  fallback?: string;
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
  label?: string;
  title?: string;
  fallback?: string;
}

export function toProgressData(event: JobProgressEvent): WebChatProgressData {
  const display = formatMessageProgressDisplay(event);
  const data: WebChatProgressData = {
    type: event.type,
    status: event.status,
    operationType: event.metadata.operationType,
    title: display.title,
    label: display.label,
    fallback: display.fallback,
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
  if (display.amount) {
    data.amount = display.amount;
  }
  return data;
}

export function toToolStatusData(
  update: ToolStatusUpdate,
): WebChatToolStatusData {
  const display = getToolStatusDisplay(update);
  const sharedData = {
    label: display.label,
    title: display.title,
    fallback: display.fallback,
  };
  switch (update.state) {
    case "running":
      return {
        ...sharedData,
        status: "tool-running",
        toolName: update.toolName,
        message: `Using ${display.label}…`,
      };
    case "completed":
      return {
        ...sharedData,
        status: "tool-completed",
        toolName: update.toolName,
        message: `Finished ${display.label}.`,
      };
    case "awaiting-approval":
      return {
        ...sharedData,
        status: "tool-awaiting-approval",
        toolName: update.toolName,
        message: `${capitalize(display.label)} is awaiting approval.`,
      };
    case "failed":
      return {
        ...sharedData,
        status: "tool-failed",
        toolName: update.toolName,
        message: `${capitalize(display.label)} failed.`,
        ...(update.error !== undefined && { error: update.error }),
      };
  }
}

function capitalize(value: string): string {
  return value.length > 0
    ? `${value[0]?.toUpperCase()}${value.slice(1)}`
    : value;
}
