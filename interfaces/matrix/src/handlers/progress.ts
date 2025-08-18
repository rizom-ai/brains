import type { JobProgressEvent, Logger } from "@brains/plugins";
import { markdownToHtml } from "@brains/plugins";
import type { MatrixClientWrapper } from "../client/matrix-client";

/**
 * Format operation display name from progress event metadata
 */
export function formatOperationDisplay(
  progressEvent: JobProgressEvent,
): string {
  const operationType = progressEvent.metadata.operationType.replace(/_/g, " ");
  const operationTarget = progressEvent.metadata.operationTarget;

  if (operationTarget) {
    return `${operationType}: ${operationTarget}`;
  }
  return operationType;
}

/**
 * Handle progress event for Matrix interface
 * Note: Job ownership filtering is now handled by the parent MessageInterfacePlugin.ownsJob()
 */
export async function handleProgressEvent(
  progressEvent: JobProgressEvent,
  client: MatrixClientWrapper | undefined,
  logger: Logger,
  roomId: string,    // Required - Matrix room for message routing
  messageId: string, // Required - Matrix message ID for editing
): Promise<void> {
  if (!client) {
    logger.debug("Matrix client not available for progress event", {
      jobId: progressEvent.id,
    });
    return;
  }

  // Handle job progress events
  if (progressEvent.type === "job") {
    await handleJobProgress(progressEvent, roomId, client, messageId, logger);
  } else {
    // Handle batch progress events
    await handleBatchProgress(progressEvent, roomId, client, messageId, logger);
  }
}

/**
 * Handle individual job progress updates
 */
export async function handleJobProgress(
  progressEvent: JobProgressEvent,
  roomId: string,
  client: MatrixClientWrapper,
  messageId: string,
  logger: Logger,
): Promise<void> {

  // Create rich message with operation details
  let message: string;
  const operationDisplay = formatOperationDisplay(progressEvent);

  if (progressEvent.status === "completed") {
    message = `✅ **${operationDisplay}** completed`;

    // Add progress details if available
    if (progressEvent.progress) {
      const { current, total } = progressEvent.progress;
      if (total && total > 1) {
        message += ` (${current}/${total} items processed)`;
      }
    }
  } else if (progressEvent.status === "failed") {
    message = `❌ **${operationDisplay}** failed`;

    // Add error details if available
    if (progressEvent.message) {
      message += `\n> ${progressEvent.message}`;
    }
  } else if (progressEvent.status === "processing" && progressEvent.progress) {
    // Show processing status with details for long-running jobs
    const { current, total, percentage } = progressEvent.progress;

    message = `🔄 **${operationDisplay}** in progress`;

    if (total && total > 1) {
      message += `\n📊 Progress: ${current}/${total} (${percentage}%)`;
    }

    if (progressEvent.metadata.operationTarget) {
      message += `\n📂 Target: \`${progressEvent.metadata.operationTarget}\``;
    }
  } else {
    // Don't send messages for other statuses (pending) to avoid spam
    return;
  }

  try {
    // Edit the original command response message with progress
    await client.editMessage(
      roomId,
      messageId,
      message,
      markdownToHtml(message),
    );
    logger.debug("Edited message with job progress", {
      jobId: progressEvent.id,
      messageId,
    });
  } catch (error) {
    logger.error("Failed to send/edit job progress message", {
      error,
      jobId: progressEvent.id,
    });
  }
}

/**
 * Handle batch progress updates
 */
export async function handleBatchProgress(
  progressEvent: JobProgressEvent,
  roomId: string,
  client: MatrixClientWrapper,
  messageId: string,
  logger: Logger,
): Promise<void> {

  const { batchDetails } = progressEvent;
  if (!batchDetails) return;

  let message: string;
  const operationDisplay = formatOperationDisplay(progressEvent);

  if (progressEvent.status === "completed") {
    message = `✅ **Batch ${operationDisplay}** completed\n`;
    message += `📊 Total: ${batchDetails.totalOperations} operations\n`;
    message += `✅ Completed: ${batchDetails.completedOperations}\n`;
    if (batchDetails.failedOperations > 0) {
      message += `❌ Failed: ${batchDetails.failedOperations}`;
    }
  } else if (progressEvent.status === "failed") {
    message = `❌ **Batch ${operationDisplay}** failed`;
    if (batchDetails.errors && batchDetails.errors.length > 0) {
      message += "\nErrors:\n";
      batchDetails.errors.forEach((error) => {
        message += `• ${error}\n`;
      });
    }
  } else if (progressEvent.status === "processing" && progressEvent.progress) {
    const { percentage } = progressEvent.progress;
    message = `🔄 **Batch ${operationDisplay}** in progress\n`;
    message += `📊 Progress: ${batchDetails.completedOperations}/${batchDetails.totalOperations} (${percentage}%)`;

    if (batchDetails.currentOperation) {
      message += `\n📂 Current: ${batchDetails.currentOperation}`;
    }
  } else {
    // Don't send messages for other statuses
    return;
  }

  try {
    // Edit the original command response message with batch progress
    await client.editMessage(
      roomId,
      messageId,
      message,
      markdownToHtml(message),
    );
    logger.debug("Edited message with batch progress", {
      batchId: progressEvent.id,
      messageId,
    });
  } catch (error) {
    logger.error("Failed to send/edit batch progress message", {
      error,
      batchId: progressEvent.id,
    });
  }
}
