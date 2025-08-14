import type { JobProgressEvent, JobContext, Logger } from "@brains/plugins";
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
 */
export async function handleProgressEvent(
  progressEvent: JobProgressEvent,
  context: JobContext,
  client: MatrixClientWrapper | undefined,
  jobMessages: Map<string, string>,
  logger: Logger,
): Promise<void> {
  // Matrix only handles events from Matrix interface
  if (context.interfaceId !== "matrix") {
    return; // Event not from Matrix interface
  }

  // Use channelId from metadata instead of parsing target
  const roomId = context.channelId;
  if (!roomId) {
    return; // No routing information
  }

  // Handle job progress events
  if (progressEvent.type === "job") {
    await handleJobProgress(progressEvent, roomId, client, jobMessages, logger);
  } else {
    // Handle batch progress events
    await handleBatchProgress(
      progressEvent,
      roomId,
      client,
      jobMessages,
      logger,
    );
  }
}

/**
 * Handle individual job progress updates
 */
export async function handleJobProgress(
  progressEvent: JobProgressEvent,
  roomId: string,
  client: MatrixClientWrapper | undefined,
  jobMessages: Map<string, string>,
  logger: Logger,
): Promise<void> {
  if (!client) return;

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
    const { current, total, percentage, etaFormatted, rateFormatted } =
      progressEvent.progress;

    message = `🔄 **${operationDisplay}** in progress`;

    if (total && total > 1) {
      message += `\n📊 Progress: ${current}/${total} (${percentage}%)`;

      if (etaFormatted) {
        message += `\n⏱️ ETA: ${etaFormatted}`;
      }

      if (rateFormatted) {
        message += `\n⚡ Rate: ${rateFormatted}`;
      }
    }

    if (progressEvent.metadata.operationTarget) {
      message += `\n📂 Target: \`${progressEvent.metadata.operationTarget}\``;
    }
  } else {
    // Don't send messages for other statuses (pending) to avoid spam
    return;
  }

  const existingMessageId = jobMessages.get(progressEvent.id);

  logger.debug("Checking for existing job message", {
    jobId: progressEvent.id,
    existingMessageId,
    allMappings: Array.from(jobMessages.entries()),
  });

  try {
    if (existingMessageId) {
      // Edit the original command response message with progress
      await client.editMessage(
        roomId,
        existingMessageId,
        message,
        markdownToHtml(message),
      );
      logger.debug("Edited existing message with job progress", {
        jobId: progressEvent.id,
        messageId: existingMessageId,
      });
    } else {
      // Send new progress message if no existing message to edit
      const messageId = await client.sendFormattedMessage(
        roomId,
        message,
        markdownToHtml(message),
        false,
      );
      // Store for future edits
      jobMessages.set(progressEvent.id, messageId);
      logger.debug("Sent new job progress message", {
        jobId: progressEvent.id,
        messageId,
      });
    }
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
  client: MatrixClientWrapper | undefined,
  jobMessages: Map<string, string>,
  logger: Logger,
): Promise<void> {
  if (!client) return;

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
    const { percentage, etaFormatted } = progressEvent.progress;
    message = `🔄 **Batch ${operationDisplay}** in progress\n`;
    message += `📊 Progress: ${batchDetails.completedOperations}/${batchDetails.totalOperations} (${percentage}%)`;

    if (etaFormatted) {
      message += `\n⏱️ ETA: ${etaFormatted}`;
    }

    if (batchDetails.currentOperation) {
      message += `\n📂 Current: ${batchDetails.currentOperation}`;
    }
  } else {
    // Don't send messages for other statuses
    return;
  }

  const existingMessageId = jobMessages.get(progressEvent.id);

  try {
    if (existingMessageId) {
      await client.editMessage(
        roomId,
        existingMessageId,
        message,
        markdownToHtml(message),
      );
      logger.debug("Edited existing message with batch progress", {
        batchId: progressEvent.id,
        messageId: existingMessageId,
      });
    } else {
      const messageId = await client.sendFormattedMessage(
        roomId,
        message,
        markdownToHtml(message),
        false,
      );
      jobMessages.set(progressEvent.id, messageId);
      logger.debug("Sent new batch progress message", {
        batchId: progressEvent.id,
        messageId,
      });
    }
  } catch (error) {
    logger.error("Failed to send/edit batch progress message", {
      error,
      batchId: progressEvent.id,
    });
  }
}
