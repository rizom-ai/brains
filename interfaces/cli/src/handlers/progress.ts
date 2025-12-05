import type { JobProgressEvent } from "@brains/plugins";

export interface ProgressAction {
  type: "UPDATE_PROGRESS" | "CLEANUP_PROGRESS";
  payload: JobProgressEvent;
}

/**
 * Progress reducer for state management
 */
export function progressReducer(
  state: Map<string, JobProgressEvent>,
  action: ProgressAction,
): Map<string, JobProgressEvent> {
  const newState = new Map(state);

  switch (action.type) {
    case "UPDATE_PROGRESS":
      newState.set(action.payload.id, action.payload);
      break;
    case "CLEANUP_PROGRESS":
      newState.delete(action.payload.id);
      break;
    default:
      return state;
  }

  return newState;
}

/**
 * Format progress message for display
 */
export function formatProgressMessage(progressEvent: JobProgressEvent): string {
  const operationType = progressEvent.metadata.operationType.replace(/_/g, " ");
  const operationTarget = progressEvent.metadata.operationTarget ?? "";

  let message = "";
  if (progressEvent.status === "completed") {
    message = `✅ **${operationType}${operationTarget ? `: ${operationTarget}` : ""}** completed`;
  } else if (progressEvent.status === "failed") {
    message = `❌ **${operationType}${operationTarget ? `: ${operationTarget}` : ""}** failed`;
  } else if (progressEvent.status === "processing" && progressEvent.progress) {
    message = `🔄 **${operationType}${operationTarget ? `: ${operationTarget}` : ""}** in progress`;
    if (progressEvent.progress.total > 0) {
      message += `\n📊 Progress: ${progressEvent.progress.current}/${progressEvent.progress.total} (${progressEvent.progress.percentage}%)`;
    }
    if (operationTarget) {
      message += `\n📂 Target: \`${operationTarget}\``;
    }
  }

  return message;
}

// The handleProgressEvent function has been moved to CLIInterface class
