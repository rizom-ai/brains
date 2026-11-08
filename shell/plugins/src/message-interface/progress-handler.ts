import type { InterfacePluginContext } from "../interface/context";
import {
  jobProgressChannel,
  type JobProgressEvent,
  type JobContext,
} from "@brains/job-queue";

/**
 * Handlers for progress event processing
 */
export interface ProgressHandlers {
  onProgress: (event: JobProgressEvent, context: JobContext) => Promise<void>;
  onError: (error: unknown) => void;
}

/**
 * Setup progress event handler with callbacks
 * Subscribes to the job progress channel, which refuses a malformed event,
 * and routes each valid one
 */
export function setupProgressHandler(
  context: InterfacePluginContext,
  handlers: ProgressHandlers,
): void {
  context.messaging.subscribe(jobProgressChannel, async (progressEvent) => {
    try {
      await handlers.onProgress(progressEvent, progressEvent.metadata);

      return { success: true };
    } catch (error) {
      handlers.onError(error);
      return { success: false };
    }
  });
}

/**
 * Format a completion/failure message for display
 */
export function formatCompletionMessage(event: JobProgressEvent): string {
  const statusEmoji = event.status === "completed" ? "✅" : "❌";
  const statusText = event.status === "completed" ? "completed" : "failed";
  const operationType = event.metadata.operationType.replace(/_/g, " ");
  const target = event.metadata.operationTarget
    ? `: ${event.metadata.operationTarget}`
    : "";

  let message = `${statusEmoji} **${operationType}${target}** ${statusText}`;

  // Include event message if present (e.g., "Site build completed: 32 routes built")
  if (event.message) {
    message += `\n${event.message}`;
  }

  return message;
}

/**
 * Format a progress message for display
 */
export function formatProgressMessage(event: JobProgressEvent): string {
  const operationType = event.metadata.operationType.replace(/_/g, " ");
  const target = event.metadata.operationTarget
    ? `: ${event.metadata.operationTarget}`
    : "";

  let message = `🔄 **${operationType}${target}**`;

  if (event.progress && event.progress.total > 0) {
    message += ` ${event.progress.current}/${event.progress.total} (${event.progress.percentage}%)`;
  }

  if (event.message) {
    message += `\n${event.message}`;
  }

  return message;
}
