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
  switch (update.state) {
    case "running":
      return {
        status: "tool-running",
        toolName: update.toolName,
        message: `Using ${update.toolName}…`,
      };
    case "completed":
      return {
        status: "tool-completed",
        toolName: update.toolName,
        message: `Finished ${update.toolName}.`,
      };
    case "awaiting-approval":
      return {
        status: "tool-awaiting-approval",
        toolName: update.toolName,
        message: `${update.toolName} is awaiting approval.`,
      };
    case "failed":
      return {
        status: "tool-failed",
        toolName: update.toolName,
        message: `${update.toolName} failed.`,
        ...(update.error !== undefined && { error: update.error }),
      };
  }
}
