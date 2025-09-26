import type { InterfacePluginContext, Logger } from "@brains/plugins";
import { JobProgressEventSchema } from "@brains/plugins";

/**
 * Set up listener for job progress events
 * This is primarily for debugging and logging purposes
 */
export function setupJobProgressListener(
  context: InterfacePluginContext,
  logger: Logger,
): void {
  // Subscribe to job-progress events for debugging
  context.subscribe("job-progress", async (message) => {
    const validationResult = JobProgressEventSchema.safeParse(message.payload);

    if (!validationResult.success) {
      logger.warn("Received invalid job-progress message", {
        error: validationResult.error.message,
      });
      return { success: false };
    }

    const event = validationResult.data;

    // Log different types of progress events
    const eventType = event.type; // "job" or "batch"
    const status = event.status;
    const eventId = event.id; // This is batchId for batch events, jobId for job events

    logger.debug(`${eventType} ${eventId} - ${status}:`, {
      id: event.id,
      message: event.message,
      progress: event.progress,
      metadata: event.metadata,
    });

    // Log batch-specific details if available
    if (event.batchDetails) {
      logger.debug(`Batch details for ${eventId}:`, {
        totalOperations: event.batchDetails.totalOperations,
        completedOperations: event.batchDetails.completedOperations,
        failedOperations: event.batchDetails.failedOperations,
        currentOperation: event.batchDetails.currentOperation,
        errors: event.batchDetails.errors,
      });
    }

    // Log job-specific details if available
    if (event.jobDetails) {
      logger.debug(`Job details for ${eventId}:`, {
        jobType: event.jobDetails.jobType,
        priority: event.jobDetails.priority,
        retryCount: event.jobDetails.retryCount,
      });
    }

    return { success: true };
  });

  logger.debug("Subscribed to job progress events");
}
