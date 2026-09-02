import {
  browserChatProgressEventSchema,
  browserChatToolStatusEventSchema,
} from "@brains/contracts/browser-chat";
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
  browserChatProgressEventSchema.parse(data);
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
  let data: WebChatToolStatusData;
  switch (update.state) {
    case "running":
      data = {
        ...sharedData,
        status: "tool-running",
        toolName: update.toolName,
        message: `Using ${display.label}…`,
      };
      break;
    case "completed":
      data = {
        ...sharedData,
        status: "tool-completed",
        toolName: update.toolName,
        message: `Finished ${display.label}.`,
      };
      break;
    case "awaiting-approval":
      data = {
        ...sharedData,
        status: "tool-awaiting-approval",
        toolName: update.toolName,
        message: `${capitalize(display.label)} is awaiting approval.`,
      };
      break;
    case "failed":
      data = {
        ...sharedData,
        status: "tool-failed",
        toolName: update.toolName,
        message: `${capitalize(display.label)} failed.`,
        ...(update.error !== undefined && { error: update.error }),
      };
      break;
  }
  browserChatToolStatusEventSchema.parse(data);
  return data;
}

function capitalize(value: string): string {
  return value.length > 0
    ? `${value[0]?.toUpperCase()}${value.slice(1)}`
    : value;
}
