import type {
  JobProgressEvent,
  JobContext,
  Logger,
  MessageContext,
} from "@brains/plugins";

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

/**
 * Handle progress event for CLI interface
 */
export async function handleProgressEvent(
  progressEvent: JobProgressEvent,
  context: JobContext,
  progressEvents: Map<string, JobProgressEvent>,
  callbacks: {
    progressCallback: ((events: JobProgressEvent[]) => void) | undefined;
    editMessage: (
      messageId: string,
      content: string,
      context: MessageContext,
    ) => Promise<void>;
  },
  jobMessages: Map<string, string>,
  logger: Logger,
): Promise<Map<string, JobProgressEvent>> {
  try {
    // CLI only handles events from CLI interface
    if (context.interfaceId !== "cli") {
      return progressEvents; // Event not from CLI interface
    }

    // Add/update all events (processing, completed, failed)
    const updatedEvents = progressReducer(progressEvents, {
      type: "UPDATE_PROGRESS",
      payload: progressEvent,
    });

    // Always notify React component of the change
    if (callbacks.progressCallback) {
      // Send all events to the status bar
      const allEvents = Array.from(updatedEvents.values());
      callbacks.progressCallback(allEvents);
    }

    // Also send progress update as message edit for inline progress bars
    const existingMessageId = jobMessages.get(progressEvent.id);
    if (existingMessageId) {
      const message = formatProgressMessage(progressEvent);
      if (message) {
        await callbacks.editMessage(existingMessageId, message, {
          userId: progressEvent.metadata.userId,
          channelId: progressEvent.metadata.channelId ?? "cli",
          messageId: existingMessageId,
          timestamp: new Date(),
          interfaceType: "cli",
          userPermissionLevel: "anchor",
        });
      }
    }

    return updatedEvents;
  } catch (error) {
    logger.error("Error handling progress event in CLI", { error });
    return progressEvents;
  }
}
