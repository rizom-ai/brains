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
  switch (event.type) {
    case "tool:invoking":
      return {
        status: "tool-invoking",
        toolName: event.toolName,
        message: `Using ${event.toolName}…`,
      };
    case "tool:completed":
      return {
        status: "tool-completed",
        toolName: event.toolName,
        message: `Finished ${event.toolName}.`,
      };
    case "tool:failed":
      return {
        status: "tool-failed",
        toolName: event.toolName,
        message: `${event.toolName} failed.`,
        ...(event.error !== undefined && { error: event.error }),
      };
  }
}
